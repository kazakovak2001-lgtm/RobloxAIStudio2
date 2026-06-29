import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class RequirementsAgent extends BaseAgent {
    readonly name = "Requirements";
    readonly description = "Analyzes and extracts game requirements";
    readonly inputSchema: {
        type: string;
        properties: {
            prompt: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            requirements: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        prompt: string;
    }): Promise<Record<string, unknown>>;
}
