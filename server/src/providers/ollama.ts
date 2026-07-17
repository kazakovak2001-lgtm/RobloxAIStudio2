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
    this.baseUrl = config?.baseURL ?? "http://127.0.0.1:11434";
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
        const url = `${this.baseUrl}/api/generate`;
        const requestBody = {
          model,
          prompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 2000,
          },
        };

        console.log(`[ollama-debug] URL: ${url}`);
        console.log(`[ollama-debug] Method: POST`);
        console.log(`[ollama-debug] Body: ${JSON.stringify(requestBody)}`);

        let response: Response;
        try {
          response = await fetchWithTimeout(
            url,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            },
            timeout,
          );
        } catch (fetchErr) {
          console.error(`[ollama-debug] fetch() threw:`, fetchErr);
          console.error(
            `[ollama-debug] Stack:`,
            fetchErr instanceof Error ? fetchErr.stack : "none",
          );
          throw fetchErr;
        }

        console.log(`[ollama-debug] HTTP status: ${response.status}`);

        const rawText = await response.text();
        console.log(`[ollama-debug] Raw response body: ${rawText}`);

        if (!response.ok) {
          throw new LLMError(
            `Ollama API error: ${response.status}`,
            "ollama",
            response.status,
            response.status >= 500,
          );
        }

        let data: { response: string; eval_count?: number };
        try {
          data = JSON.parse(rawText) as {
            response: string;
            eval_count?: number;
          };
        } catch (parseErr) {
          console.error(`[ollama-debug] JSON parse failed:`, parseErr);
          throw parseErr;
        }

        console.log(
          `[ollama-debug] Parsed keys: ${Object.keys(data).join(", ")}`,
        );
        console.log(
          `[ollama-debug] response length: ${data.response?.length ?? 0}`,
        );

        return {
          content: data.response ?? "",
          model,
          tokensUsed: data.eval_count,
          finishReason: "complete" as const,
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
