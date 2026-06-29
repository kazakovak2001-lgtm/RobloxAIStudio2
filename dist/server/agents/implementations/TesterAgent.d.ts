import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class TesterAgent extends BaseAgent {
    readonly name = "Tester";
    readonly description = "Tests generated code";
    readonly inputSchema: {
        type: string;
        properties: {
            generatedCode: {
                type: string;
            };
            gameDesign: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            testResults: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        generatedCode: Record<string, unknown>;
        gameDesign: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
