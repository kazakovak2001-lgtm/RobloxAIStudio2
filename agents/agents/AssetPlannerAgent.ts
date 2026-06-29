import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface AssetPlannerInput {
  prompt: string;
}

interface AssetPlannerOutput {
  assetCategories: string[];
  assetNeeds: string[];
  priorities: string[];
}

export class AssetPlannerAgent extends AgentBase<
  AssetPlannerInput,
  AssetPlannerOutput
> {
  readonly name = "AssetPlannerAgent";
  readonly description =
    "Plans the asset architecture and craft needs for the future experience.";
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
      assetCategories: { type: "array", items: { type: "string" } },
      assetNeeds: { type: "array", items: { type: "string" } },
      priorities: { type: "array", items: { type: "string" } },
    },
    required: ["assetCategories", "assetNeeds", "priorities"],
  };

  async execute(
    input: AssetPlannerInput
  ): Promise<AgentExecutionResult<AssetPlannerOutput>> {
    const output: AssetPlannerOutput = {
      assetCategories: ["Environment", "Collectibles", "UI"],
      assetNeeds: ["Icons", "Particle effects", "Progression visuals"],
      priorities: ["Core loop assets", "UI polish", "Progression feedback"],
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
