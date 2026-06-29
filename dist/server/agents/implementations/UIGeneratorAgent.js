import { BaseAgent } from "../core/BaseAgent";
export class UIGeneratorAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "UIGenerator";
        this.description = "Generates UI designs and layouts";
        this.inputSchema = {
            type: "object",
            properties: {
                gameDesign: { type: "object" },
                architecture: { type: "object" },
            },
            required: ["gameDesign", "architecture"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                uiDesign: { type: "object" },
            },
            required: ["uiDesign"],
        };
    }
    async process(_input) {
        return {
            uiDesign: {
                screens: [],
                components: {},
            },
        };
    }
}
