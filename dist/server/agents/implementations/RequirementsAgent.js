import { BaseAgent } from "../core/BaseAgent";
export class RequirementsAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Requirements";
        this.description = "Analyzes and extracts game requirements";
        this.inputSchema = {
            type: "object",
            properties: {
                prompt: { type: "string" },
            },
            required: ["prompt"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                requirements: { type: "object" },
            },
            required: ["requirements"],
        };
    }
    async process(_input) {
        return {
            requirements: {
                coreConcept: "Game concept",
                genre: "Adventure",
                keyFeatures: [],
            },
        };
    }
}
