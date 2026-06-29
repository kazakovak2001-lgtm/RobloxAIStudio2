export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    model?: string;
}
export interface LLMProvider {
    generate(prompt: string, options?: LLMOptions): Promise<string>;
}
export interface BaseAIProvider {
    get(_url: string): Promise<unknown>;
    post(_url: string, _data: unknown): Promise<unknown>;
}
export declare class AIProvider implements LLMProvider {
    generate(_prompt: string, _options?: LLMOptions): Promise<string>;
}
