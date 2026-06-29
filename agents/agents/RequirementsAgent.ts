import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface RequirementsInput {
  prompt: string;
}

interface RequirementsOutput {
  scope: string[];
  goals: string[];
  constraints: string[];
}

export class RequirementsAgent extends AgentBase<
  RequirementsInput,
  RequirementsOutput
> {
  readonly name = "RequirementsAgent";
  readonly description =
    "Extracts goals, scope, and constraints from a creator prompt.";
  readonly inputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      prompt: { type: "string" },
    },
    required: ["prompt"],
  };

  readonly outputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      scope: { type: "array", items: { type: "string" } },
      goals: { type: "array", items: { type: "string" } },
      constraints: { type: "array", items: { type: "string" } },
    },
    required: ["scope", "goals", "constraints"],
  };

  async execute(
    input: RequirementsInput
  ): Promise<AgentExecutionResult<RequirementsOutput>> {
    const prompt = input.prompt.toLowerCase();
    const output: RequirementsOutput = {
      scope: ["gameplay loop", "progression", "social features"],
      goals: prompt.includes("pet")
        ? ["Introduce companion systems"]
        : ["Establish core game loop"],
      constraints: [
        "No Roblox scripts generated in the current phase",
        "Keep the architecture provider-agnostic",
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
