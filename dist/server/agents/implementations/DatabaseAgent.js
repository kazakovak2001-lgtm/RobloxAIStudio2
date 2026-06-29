import { BaseAgent } from "../core/BaseAgent";
export class DatabaseAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Database";
        this.description = "Designs database schema";
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
                database: { type: "object" },
            },
            required: ["database"],
        };
    }
    async process(_input) {
        return {
            database: {
                tables: [],
                relationships: [],
            },
        };
    }
}
