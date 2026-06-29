import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class UIGeneratorAgent extends BaseAgent {
    readonly name = "UIGenerator";
    readonly description = "Generates UI designs and layouts";
    readonly inputSchema: {
        type: string;
        properties: {
            gameDesign: {
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
            uiDesign: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        gameDesign: Record<string, unknown>;
        architecture: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
