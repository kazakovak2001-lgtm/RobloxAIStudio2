/**
 * Neutral LLM provider contract shared by AI consumers and provider adapters.
 */

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stop?: string[];
  timeout?: number;
  responseFormat?: "text" | "json";
  /**
   * JSON Schema the response must conform to, for providers that support
   * constrained decoding.
   *
   * Stronger than `responseFormat: "json"`: where that asks a model to please
   * emit JSON, this makes malformed JSON unrepresentable at the decoder. A
   * provider without the capability ignores it and behaves exactly as before,
   * so setting it is always safe.
   */
  responseSchema?: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  finishReason?: "complete" | "length" | "error";
  durationMs?: number;
}

export interface LLMProvider {
  readonly name: string;
  generate(prompt: string, options?: LLMOptions): Promise<string>;
  generateWithMeta?(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
  stream?(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: LLMOptions,
  ): Promise<void>;
  healthCheck?(): Promise<boolean>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
