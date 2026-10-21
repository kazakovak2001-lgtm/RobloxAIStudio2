import type { LLMProvider, LLMOptions, LLMResponse } from "../types/llm";
import { LLMError } from "../types/llm";
import { fetchWithTimeout, withRetry, parseProviderError } from "./llmUtils";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private maxRetries: number;
  private defaultTimeout: number;

  constructor(config: {
    apiKey: string;
    baseURL?: string;
    model?: string;
    maxRetries?: number;
    timeout?: number;
  }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseURL ?? "https://api.openai.com/v1";
    this.defaultModel =
      config.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    this.maxRetries = config.maxRetries ?? 2;
    this.defaultTimeout = config.timeout ?? 30000;
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const result = await this.generateWithMeta(prompt, options);
    return result.content;
  }

  async generateWithMeta(
    prompt: string,
    options?: LLMOptions,
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const timeout = options?.timeout ?? this.defaultTimeout;

    return withRetry(
      async () => {
        const start = Date.now();
        const body: Record<string, unknown> = {
          model,
          messages: options?.system
            ? [
                { role: "system", content: options.system },
                { role: "user", content: prompt },
              ]
            : [{ role: "user", content: prompt }],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        };
        if (options?.stop) body.stop = options.stop;
        if (options?.responseFormat === "json")
          body.response_format = { type: "json_object" };

        const response = await fetchWithTimeout(
          `${this.baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
          },
          timeout,
        );

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw parseProviderError("openai", response.status, errorBody);
        }

        const data = (await response.json()) as {
          choices: Array<{
            message: { content: string };
            finish_reason: string;
          }>;
          usage?: { total_tokens: number };
        };
        const content = data.choices[0]?.message?.content ?? "";
        return {
          content,
          model,
          tokensUsed: data.usage?.total_tokens,
          finishReason:
            data.choices[0]?.finish_reason === "stop" ? "complete" : "length",
          durationMs: Date.now() - start,
        };
      },
      this.maxRetries,
      "openai",
    );
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: LLMOptions,
  ): Promise<void> {
    const model = options?.model ?? this.defaultModel;
    const timeout = options?.timeout ?? 60000;

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };

    const response = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      timeout,
    );

    if (!response.ok)
      throw new LLMError(
        `OpenAI stream error: ${response.status}`,
        "openai",
        response.status,
        false,
      );
    if (!response.body)
      throw new LLMError("No response body for streaming", "openai");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const json = JSON.parse(line.slice(6)) as {
            choices: Array<{ delta: { content?: string } }>;
          };
          const content = json.choices[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {
          /* skip malformed */
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/models`,
        { method: "GET", headers: { Authorization: `Bearer ${this.apiKey}` } },
        5000,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
