import { BaseAgent } from "../core/BaseAgent";
import type { LLMProvider, LLMOptions } from "../../types";
export declare class PlannerAgent extends BaseAgent {
    readonly name = "Planner";
    readonly description = "Creates project plans and timelines";
    readonly inputSchema: {
        type: string;
        properties: {
            requirements: {
                type: string;
            };
        };
        required: string[];
    };
    readonly outputSchema: {
        type: string;
        properties: {
            plan: {
                type: string;
            };
        };
        required: string[];
    };
    constructor(_llm?: LLMProvider, _options?: LLMOptions);
    protected process(_input: {
        requirements: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
}
