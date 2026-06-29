export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stop?: string[];
}

export interface LLMProvider {
  generate(prompt: string, options?: LLMOptions): Promise<string>;
  stream?(prompt: string, onChunk: (chunk: string) => void): Promise<void>;
}

export interface AIProvider extends LLMProvider {
  initialize?(): Promise<void>;
  healthCheck?(): Promise<boolean>;
}
