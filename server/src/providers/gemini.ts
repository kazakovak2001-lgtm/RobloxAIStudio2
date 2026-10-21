import type { LLMProvider, LLMOptions, LLMResponse } from "../types/llm";
import { fetchWithTimeout, withRetry, parseProviderError } from "./llmUtils";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
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
    this.baseUrl =
      config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
    this.defaultModel =
      config.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
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
        const response = await fetchWithTimeout(
          `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              ...(options?.system
                ? {
                    systemInstruction: { parts: [{ text: options.system }] },
                  }
                : {}),
              generationConfig: {
                temperature: options?.temperature ?? 0.7,
                maxOutputTokens: options?.maxTokens ?? 4096,
              },
            }),
          },
          timeout,
        );

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw parseProviderError("gemini", response.status, errorBody);
        }

        const data = (await response.json()) as {
          candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
          usageMetadata?: { totalTokenCount: number };
        };
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return {
          content,
          model,
          tokensUsed: data.usageMetadata?.totalTokenCount,
          finishReason: "complete",
          durationMs: Date.now() - start,
        };
      },
      this.maxRetries,
      "gemini",
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        { method: "GET" },
        5000,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
