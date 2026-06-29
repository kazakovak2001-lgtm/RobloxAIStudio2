import { BaseAgent } from "../core/BaseAgent";
export class DocumentationAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Documentation";
        this.description = "Generates documentation";
        this.inputSchema = {
            type: "object",
            properties: {
                architecture: { type: "object" },
                generatedCode: { type: "object" },
            },
            required: ["architecture", "generatedCode"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                documentation: { type: "object" },
            },
            required: ["documentation"],
        };
    }
    async process(_input) {
        return {
            documentation: {
                readme: "",
                api: {},
            },
        };
    }
}
