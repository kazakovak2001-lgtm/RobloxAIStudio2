import { BaseAgent } from "../core/BaseAgent";
export class AssetPlannerAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "AssetPlanner";
        this.description = "Plans game assets and resources";
        this.inputSchema = {
            type: "object",
            properties: {
                requirements: { type: "object" },
                gameDesign: { type: "object" },
            },
            required: ["requirements", "gameDesign"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                assetPlan: { type: "object" },
            },
            required: ["assetPlan"],
        };
    }
    async process(_input) {
        return {
            assetPlan: {
                models: [],
                textures: [],
                audio: [],
            },
        };
    }
}
