import { BaseAgent } from "../core/BaseAgent";
export class GameDesignerAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "GameDesigner";
        this.description = "Designs game mechanics and gameplay";
        this.inputSchema = {
            type: "object",
            properties: {
                requirements: { type: "object" },
                plan: { type: "object" },
            },
            required: ["requirements", "plan"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                gameDesign: { type: "object" },
            },
            required: ["gameDesign"],
        };
    }
    async process(_input) {
        return {
            gameDesign: {
                mechanics: [],
                progression: {},
                balance: {},
                playerJourney: {},
                monetizationHooks: [],
            },
        };
    }
}
