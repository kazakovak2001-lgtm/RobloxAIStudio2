import type { LLMProvider, LLMOptions, LLMResponse } from "../types/llm";
import { LLMError } from "../types/llm";
import { fetchWithTimeout, withRetry, parseProviderError } from "./llmUtils";

/**
 * OpenRouter provider — routes to multiple LLMs via OpenRouter API.
 * Uses OpenAI-compatible format.
 */
export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
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
    this.baseUrl = config.baseURL ?? "https://openrouter.ai/api/v1";
    this.defaultModel =
      config.model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
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
          messages: [{ role: "user", content: prompt }],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        };
        if (options?.stop) body.stop = options.stop;

        const response = await fetchWithTimeout(
          `${this.baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
              "HTTP-Referer": "https://roblox-ai-studio.dev",
              "X-Title": "Roblox AI Studio DevKit",
            },
            body: JSON.stringify(body),
          },
          timeout,
        );

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw parseProviderError("openrouter", response.status, errorBody);
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
      "openrouter",
    );
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: LLMOptions,
  ): Promise<void> {
    const model = options?.model ?? this.defaultModel;
    const timeout = options?.timeout ?? 60000;

    const response = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
          stream: true,
        }),
      },
      timeout,
    );

    if (!response.ok)
      throw new LLMError(
        `OpenRouter stream error: ${response.status}`,
        "openrouter",
        response.status,
      );
    if (!response.body) throw new LLMError("No response body", "openrouter");

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
          /* skip */
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
