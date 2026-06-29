import { BaseAgent } from "../core/BaseAgent";
export class TesterAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Tester";
        this.description = "Tests generated code";
        this.inputSchema = {
            type: "object",
            properties: {
                generatedCode: { type: "object" },
                gameDesign: { type: "object" },
            },
            required: ["generatedCode", "gameDesign"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                testResults: { type: "object" },
            },
            required: ["testResults"],
        };
    }
    async process(_input) {
        return {
            testResults: {
                passed: 0,
                failed: 0,
                tests: [],
            },
        };
    }
}
