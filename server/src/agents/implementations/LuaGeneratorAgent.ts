import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class LuaGeneratorAgent extends BaseAgent {
  public readonly name = "LuaGenerator";
  public readonly description = "Generates Lua code for Roblox";
  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      architecture: { type: "object" },
      gameDesign: { type: "object" },
    },
    required: ["architecture", "gameDesign"],
  };
  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { generatedCode: { type: "object" } },
    required: ["generatedCode"],
  };
  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }
  protected async process(
    _input: AgentInput,
  ): Promise<Record<string, unknown>> {
    return {
      generatedCode: { scripts: [], modules: {} },
      // Keys matched to aggregator expectations (lua_generator bucket)
      lua_generator: {
        modules: [],
        patterns: [],
        server: [],
        client: [],
        shared: [],
      },
    };
  }
}
