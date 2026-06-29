import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface LuaGeneratorInput {
  prompt: string;
  architecture?: {
    modules?: string[];
  };
}

interface LuaGeneratorOutput {
  generatedFiles: string[];
  responsibilities: string[];
  notes: string[];
}

export class LuaGeneratorAgent extends AgentBase<
  LuaGeneratorInput,
  LuaGeneratorOutput
> {
  readonly name = "LuaGeneratorAgent";
  readonly description =
    "Prepares a structured plan for future Roblox Lua generation without producing scripts yet.";
  readonly inputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      prompt: { type: "string" },
      architecture: { type: "object" },
    },
    required: ["prompt"],
  };

  readonly outputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      generatedFiles: { type: "array", items: { type: "string" } },
      responsibilities: { type: "array", items: { type: "string" } },
      notes: { type: "array", items: { type: "string" } },
    },
    required: ["generatedFiles", "responsibilities", "notes"],
  };

  async execute(
    input: LuaGeneratorInput
  ): Promise<AgentExecutionResult<LuaGeneratorOutput>> {
    const output: LuaGeneratorOutput = {
      generatedFiles: ["Server/GameplayService.ts", "Client/UIService.ts"],
      responsibilities: [
        "Separate server and client concerns",
        "Prepare state contracts",
      ],
      notes: [
        "No Lua sources generated in this phase",
        "Future provider integration will hydrate the plan",
      ],
    };

    const validation = this.validate(input, output);
    return {
      agentName: this.name,
      success: validation.valid,
      output,
      validation,
      attempts: 1,
      durationMs: 0,
    };
  }
}
