import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class RobloxArchitectAgent extends BaseAgent {
    readonly name = "RobloxArchitect";
    readonly description = "Designs Roblox-specific architecture";
    readonly inputSchema: {
        type: string;
        properties: {
            gameDesign: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            architecture: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        gameDesign: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
