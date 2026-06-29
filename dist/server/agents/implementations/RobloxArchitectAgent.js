import { BaseAgent } from "../core/BaseAgent";
export class RobloxArchitectAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "RobloxArchitect";
        this.description = "Designs Roblox-specific architecture";
        this.inputSchema = {
            type: "object",
            properties: {
                gameDesign: { type: "object" },
            },
            required: ["gameDesign"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                architecture: { type: "object" },
            },
            required: ["architecture"],
        };
    }
    async process(_input) {
        return {
            architecture: {
                folderStructure: {},
                dataModels: {},
                services: {},
                apiContracts: {},
            },
        };
    }
}
