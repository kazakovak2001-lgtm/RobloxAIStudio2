import type { LLMProvider, LLMOptions, LLMResponse } from "../types/llm";
import {
  logProviderCall,
  payloadLoggingEnabled,
  previewForDebug,
} from "./providerTelemetry";
import { LLMError } from "../types/llm";
import { fetchWithTimeout, withRetry } from "./llmUtils";

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
        // B2. `stream: true` is a transport decision, not a feature request.
        //
        // With `stream: false` Ollama sends no response headers until the whole
        // generation is finished, so Node's fetch (undici) applies its own
        // ~300s headersTimeout and kills the request as `fetch failed`,
        // independently of the AbortController below. Local models routinely
        // generate for longer than that, which made every long completion — and
        // therefore every repair attempt — unreachable.
        //
        // Streaming makes headers arrive with the first token, so headersTimeout
        // cannot fire, and the continuous chunk flow keeps bodyTimeout from
        // firing either. The configured timeout in `fetchWithTimeout` is then the
        // only deadline, which is the intended behaviour.
        // Ollama's native structured output. A schema constrains decoding, so
        // the model cannot emit malformed JSON — the failure mode that blocked
        // FP-1C, where multi-line Luau arrived with raw newlines and unclosed
        // strings inside JSON string values. `format: "json"` is the weaker
        // fallback when only a format was requested. Both compose with
        // streaming: `format` constrains the tokens, `stream` controls delivery.
        const format: Record<string, unknown> | string | undefined =
          options?.responseSchema ??
          (options?.responseFormat === "json" ? "json" : undefined);

        // Reasoning-capable models (e.g. qwen3.x) stream chain-of-thought
        // into a separate `thinking` field, which this provider never reads.
        // Left to the model's own default, that reasoning can consume the
        // entire `num_predict` budget before a single `response` token is
        // emitted — HTTP 200, nonzero eval_count, empty content. Structured
        // output has no use for a reasoning trace anyway, so whenever a
        // format constraint is requested, also ask the model to skip it.
        // Free-form chat is untouched — `think` is omitted, preserving
        // whatever the model's own default is.
        const think: boolean | undefined =
          format === undefined ? undefined : false;

        const requestBody = {
          model,
          prompt,
          ...(options?.system ? { system: options.system } : {}),
          stream: true,
          ...(format === undefined ? {} : { format }),
          ...(think === undefined ? {} : { think }),
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 2000,
          },
        };

        // LLM-LOG-DATA-001. The request body carries the user brief and the
        // internal prompt, so it is never logged. Only a bounded preview is
        // available, and only outside production with the flag set.
        if (payloadLoggingEnabled()) {
          console.log(`[ollama-debug] prompt: ${previewForDebug(prompt)}`);
        }

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
          console.error(
            `[llm] provider=ollama model=${model} request failed:`,
            fetchErr instanceof Error ? fetchErr.message : fetchErr,
          );
          throw fetchErr;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new LLMError(
            `Ollama API error: ${response.status}${errorText ? `: ${errorText}` : ""}`,
            "ollama",
            response.status,
            response.status >= 500,
          );
        }

        if (!response.body) throw new LLMError("No response body", "ollama");

        // Ollama streams newline-delimited JSON. Each line carries a `response`
        // fragment; the final line carries `done: true` plus the run metadata.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";
        let tokensUsed: number | undefined;

        let doneReason: string | undefined;

        const consumeLine = (line: string): void => {
          if (!line.trim()) return;
          let chunk: {
            response?: string;
            done?: boolean;
            done_reason?: string;
            eval_count?: number;
            error?: string;
          };
          try {
            chunk = JSON.parse(line);
          } catch {
            // A partial or non-JSON line is not fatal on its own; the stream is
            // reassembled by newline and the final `done` chunk is what matters.
            return;
          }
          if (chunk.error) {
            throw new LLMError(`Ollama API error: ${chunk.error}`, "ollama");
          }
          if (chunk.response) content += chunk.response;
          if (chunk.done) {
            if (chunk.eval_count !== undefined) tokensUsed = chunk.eval_count;
            if (chunk.done_reason !== undefined) doneReason = chunk.done_reason;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) consumeLine(line);
        }
        buffer += decoder.decode();
        consumeLine(buffer);

        // Ollama's own `done_reason` is the truth about how generation ended;
        // "length" means num_predict was hit before the model was finished,
        // which is exactly the truncation this provider needs to surface
        // rather than silently reporting as a normal completion.
        const finishReason: "complete" | "length" | "error" =
          doneReason === "length" ? "length" : "complete";

        logProviderCall({
          provider: "ollama",
          model,
          status: response.status,
          durationMs: Date.now() - start,
          responseChars: content.length,
          tokensUsed,
          finishReason,
        });

        return {
          content,
          model,
          tokensUsed,
          finishReason,
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
