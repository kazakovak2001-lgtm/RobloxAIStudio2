import type { LLMProvider, LLMOptions } from "../types";
export declare class OpenAIProvider implements LLMProvider {
    private apiKey;
    private baseUrl;
    constructor(apiKey: string, baseUrl?: string);
    generate(prompt: string, options?: LLMOptions): Promise<string>;
    stream(prompt: string, onChunk: (chunk: string) => void): Promise<void>;
}
export declare class AnthropicProvider implements LLMProvider {
    private apiKey;
    private baseUrl;
    constructor(apiKey: string, baseUrl?: string);
    generate(prompt: string, options?: LLMOptions): Promise<string>;
    stream(_prompt: string, _onChunk: (chunk: string) => void): Promise<void>;
}
export declare class LocalLLMProvider implements LLMProvider {
    private endpoint;
    constructor(endpoint: string);
    generate(prompt: string, options?: LLMOptions): Promise<string>;
    stream(_prompt: string, _onChunk: (chunk: string) => void): Promise<void>;
}
