import type { LLMProvider, LLMOptions, LLMResponse } from "../ai/provider";
import { LLMError } from "../ai/provider";
import { fetchWithTimeout, withRetry } from "../ai/llmUtils";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private defaultModel: string;
  private maxRetries: number;
  private defaultTimeout: number;

  constructor(config?: {
    baseURL?: string;
    model?: string;
    maxRetries?: number;
    timeout?: number;
  }) {
    this.baseUrl = config?.baseURL ?? "http://localhost:11434";
    this.defaultModel = config?.model ?? process.env.OLLAMA_MODEL ?? "llama3";
    this.maxRetries = config?.maxRetries ?? 1;
    this.defaultTimeout = config?.timeout ?? 120000;
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
        const response = await fetchWithTimeout(
          `${this.baseUrl}/api/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              prompt,
              stream: false,
              options: {
                temperature: options?.temperature ?? 0.7,
                num_predict: options?.maxTokens ?? 2000,
              },
            }),
          },
          timeout,
        );

        if (!response.ok) {
          throw new LLMError(
            `Ollama API error: ${response.status}`,
            "ollama",
            response.status,
            response.status >= 500,
          );
        }

        const data = (await response.json()) as {
          response: string;
          eval_count?: number;
        };
        return {
          content: data.response ?? "",
          model,
          tokensUsed: data.eval_count,
          finishReason: "complete",
          durationMs: Date.now() - start,
        };
      },
      this.maxRetries,
      "ollama",
    );
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: LLMOptions,
  ): Promise<void> {
    const model = options?.model ?? this.defaultModel;
    const timeout = options?.timeout ?? this.defaultTimeout;

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 2000,
          },
        }),
      },
      timeout,
    );

    if (!response.ok)
      throw new LLMError(
        `Ollama stream error: ${response.status}`,
        "ollama",
        response.status,
      );
    if (!response.body) throw new LLMError("No response body", "ollama");

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
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line) as {
            response?: string;
            done?: boolean;
          };
          if (json.response) onChunk(json.response);
        } catch {
          /* skip */
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        { method: "GET" },
        5000,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
