import { BaseAgent } from "../core/BaseAgent";
export class LuaGeneratorAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "LuaGenerator";
        this.description = "Generates Lua code for Roblox";
        this.inputSchema = {
            type: "object",
            properties: {
                architecture: { type: "object" },
                gameDesign: { type: "object" },
            },
            required: ["architecture", "gameDesign"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                generatedCode: { type: "object" },
            },
            required: ["generatedCode"],
        };
    }
    async process(_input) {
        return {
            generatedCode: {
                scripts: [],
                modules: {},
            },
        };
    }
}
