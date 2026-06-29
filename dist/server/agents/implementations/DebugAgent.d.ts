import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class DebugAgent extends BaseAgent {
    readonly name = "Debug";
    readonly description = "Debugs and fixes issues";
    readonly inputSchema: {
        type: string;
        properties: {
            generatedCode: {
                type: string;
            };
            logs: {
                type: string;
                items: {
                    type: string;
                };
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            debugReport: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        generatedCode: Record<string, unknown>;
        logs?: string[];
    }): Promise<Record<string, unknown>>;
}
