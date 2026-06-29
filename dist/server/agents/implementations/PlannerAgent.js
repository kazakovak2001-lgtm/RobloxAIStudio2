import { BaseAgent } from "../core/BaseAgent";
export class PlannerAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Planner";
        this.description = "Creates project plans and timelines";
        this.inputSchema = {
            type: "object",
            properties: {
                requirements: { type: "object" },
            },
            required: ["requirements"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                plan: { type: "object" },
            },
            required: ["plan"],
        };
    }
    async process(_input) {
        return {
            plan: {
                phases: [],
                timeline: "TBD",
            },
        };
    }
}
