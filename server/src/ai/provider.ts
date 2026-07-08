/**
 * LLM Provider interface — the single contract all providers implement.
 */

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stop?: string[];
  timeout?: number;
  responseFormat?: "text" | "json";
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
