import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class GameDesignerAgent extends BaseAgent {
    readonly name = "GameDesigner";
    readonly description = "Designs game mechanics and gameplay";
    readonly inputSchema: {
        type: string;
        properties: {
            requirements: {
                type: string;
            };
            plan: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            gameDesign: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        requirements: Record<string, unknown>;
        plan: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
