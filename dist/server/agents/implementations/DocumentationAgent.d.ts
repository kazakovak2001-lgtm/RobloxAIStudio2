import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class DocumentationAgent extends BaseAgent {
    readonly name = "Documentation";
    readonly description = "Generates documentation";
    readonly inputSchema: {
        type: string;
        properties: {
            architecture: {
                type: string;
            };
            generatedCode: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            documentation: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        architecture: Record<string, unknown>;
        generatedCode: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
