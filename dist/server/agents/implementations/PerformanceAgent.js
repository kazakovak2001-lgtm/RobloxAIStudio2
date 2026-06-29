import { BaseAgent } from "../core/BaseAgent";
export class PerformanceAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Performance";
        this.description = "Optimizes performance";
        this.inputSchema = {
            type: "object",
            properties: {
                generatedCode: { type: "object" },
                architecture: { type: "object" },
            },
            required: ["generatedCode", "architecture"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                optimization: { type: "object" },
            },
            required: ["optimization"],
        };
    }
    async process(_input) {
        return {
            optimization: {
                recommendations: [],
                improvements: [],
            },
        };
    }
}
