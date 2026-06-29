import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class DatabaseAgent extends BaseAgent {
    readonly name = "Database";
    readonly description = "Designs database schema";
    readonly inputSchema: {
        type: string;
        properties: {
            requirements: {
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
            database: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        requirements: Record<string, unknown>;
        gameDesign: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
