import { BaseAgent } from "../core/BaseAgent";
export class DebugAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Debug";
        this.description = "Debugs and fixes issues";
        this.inputSchema = {
            type: "object",
            properties: {
                generatedCode: { type: "object" },
                logs: { type: "array", items: { type: "string" } },
            },
            required: ["generatedCode"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                debugReport: { type: "object" },
            },
            required: ["debugReport"],
        };
    }
    async process(_input) {
        return {
            debugReport: {
                issues: [],
                fixes: [],
            },
        };
    }
}
