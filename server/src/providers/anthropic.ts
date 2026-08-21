import type { LLMProvider, LLMOptions, LLMResponse } from "../types/llm";
import { LLMError } from "../types/llm";
import { fetchWithTimeout, withRetry, parseProviderError } from "./llmUtils";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
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
    this.baseUrl = config.baseURL ?? "https://api.anthropic.com/v1";
    this.defaultModel =
      config.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
    this.maxRetries = config.maxRetries ?? 2;
    this.defaultTimeout = config.timeout ?? 60000;
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
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.7,
          messages: [{ role: "user", content: prompt }],
        };
        if (options?.stop) body.stop_sequences = options.stop;
        if (options?.system) body.system = options.system;

        const response = await fetchWithTimeout(
          `${this.baseUrl}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(body),
          },
          timeout,
        );

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw parseProviderError("anthropic", response.status, errorBody);
        }

        const data = (await response.json()) as {
          content: Array<{ text: string }>;
          usage?: { input_tokens: number; output_tokens: number };
          stop_reason?: string;
        };
        const content = data.content[0]?.text ?? "";
        const tokensUsed = data.usage
          ? data.usage.input_tokens + data.usage.output_tokens
          : undefined;
        return {
          content,
          model,
          tokensUsed,
          finishReason: data.stop_reason === "end_turn" ? "complete" : "length",
          durationMs: Date.now() - start,
        };
      },
      this.maxRetries,
      "anthropic",
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
      `${this.baseUrl}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.7,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
      },
      timeout,
    );

    if (!response.ok)
      throw new LLMError(
        `Anthropic stream error: ${response.status}`,
        "anthropic",
        response.status,
        false,
      );
    if (!response.body)
      throw new LLMError("No response body for streaming", "anthropic");

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
        if (!line.startsWith("data: ")) continue;
        try {
          const json = JSON.parse(line.slice(6)) as {
            type: string;
            delta?: { text?: string };
          };
          if (json.type === "content_block_delta" && json.delta?.text)
            onChunk(json.delta.text);
        } catch {
          /* skip */
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.defaultModel,
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        },
        10000,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
