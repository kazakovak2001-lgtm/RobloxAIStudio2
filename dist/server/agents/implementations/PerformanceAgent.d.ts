import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class PerformanceAgent extends BaseAgent {
    readonly name = "Performance";
    readonly description = "Optimizes performance";
    readonly inputSchema: {
        type: string;
        properties: {
            generatedCode: {
                type: string;
            };
            architecture: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            optimization: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        generatedCode: Record<string, unknown>;
        architecture: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
