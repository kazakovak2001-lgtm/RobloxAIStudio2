/**
 * GroqProvider — Optimized for fast blueprint generation and low latency.
 */

import type { LLMProvider, LLMOptions, LLMResponse } from "../ai/provider";
import { LLMError } from "../ai/provider";
import { fetchWithTimeout, withRetry } from "../ai/llmUtils";

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private apiKey: string;
  private defaultModel: string;
  private maxRetries: number;
  private defaultTimeout: number;

  constructor(config: {
    apiKey: string;
    model?: string;
    maxRetries?: number;
    timeout?: number;
  }) {
    this.apiKey = config.apiKey;
    this.defaultModel =
      config.model ?? process.env.GROQ_MODEL ?? "llama3-8b-8192";
    this.maxRetries = config.maxRetries ?? 3;
    this.defaultTimeout = config.timeout ?? 15000; // Groq is fast — short timeout
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
        if (options?.responseFormat === "json") {
          body.response_format = { type: "json_object" };
        }

        const response = await fetchWithTimeout(
          "https://api.groq.com/openai/v1/chat/completions",
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
          throw new LLMError(
            `Groq error ${response.status}`,
            "groq",
            response.status,
            response.status >= 500 || response.status === 429,
          );
        }

        const data = (await response.json()) as Record<string, unknown>;
        const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
        const message = choice?.message as Record<string, unknown> | undefined;
        const content = String(message?.content ?? "");
        const usage = data.usage as Record<string, number> | undefined;

        return {
          content,
          model,
          tokensUsed:
            (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
          finishReason:
            (choice?.finish_reason as string) === "stop"
              ? "complete"
              : "length",
          durationMs: Date.now() - start,
        };
      },
      this.maxRetries,
      this.name,
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await fetchWithTimeout(
        "https://api.groq.com/openai/v1/models",
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
        5000,
      );
      return r.ok;
    } catch {
      return false;
    }
  }
}
