import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class LuaGeneratorAgent extends BaseAgent {
    readonly name = "LuaGenerator";
    readonly description = "Generates Lua code for Roblox";
    readonly inputSchema: {
        type: string;
        properties: {
            architecture: {
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
            generatedCode: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        architecture: Record<string, unknown>;
        gameDesign: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
