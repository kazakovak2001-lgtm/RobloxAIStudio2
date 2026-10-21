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
  /**
   * Server-authored instruction/policy text, sent through the provider's own
   * system-role channel (Anthropic's `system` field, OpenAI-compatible
   * `role: "system"` message, Gemini's `systemInstruction`, Ollama's
   * `system`) instead of being concatenated into the user-role prompt.
   *
   * This is what actually separates trusted instruction authority from
   * untrusted project/blueprint/memory content at the model boundary: a
   * single flat prompt string gives an attacker-controlled value the same
   * standing as the agent's own instructions, because nothing distinguishes
   * them once joined. Never build this from request-supplied or generated
   * content — it must be static, server-authored text.
   */
  system?: string;
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
