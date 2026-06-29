import type { LLMProvider, LLMOptions } from "../ai/provider";
export declare class OpenAIProvider implements LLMProvider {
    constructor(_config: {
        apiKey: string;
    });
    generate(_prompt: string, _options?: LLMOptions): Promise<string>;
}
