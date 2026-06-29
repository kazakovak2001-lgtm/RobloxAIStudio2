import type { LLMProvider, LLMOptions } from "../ai/provider";
export declare class OllamaProvider implements LLMProvider {
    constructor(_config?: {
        baseURL?: string;
    });
    generate(_prompt: string, _options?: LLMOptions): Promise<string>;
}
