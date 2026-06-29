import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface UIGeneratorInput {
  prompt: string;
  design?: {
    coreLoop?: string[];
  };
}

interface UIGeneratorOutput {
  screens: string[];
  components: string[];
  interactionStates: string[];
}

export class UIGeneratorAgent extends AgentBase<
  UIGeneratorInput,
  UIGeneratorOutput
> {
  readonly name = "UIGeneratorAgent";
  readonly description =
    "Defines the UI surface map and interaction states for the future Roblox experience.";
  readonly inputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      prompt: { type: "string" },
      design: { type: "object" },
    },
    required: ["prompt"],
  };

  readonly outputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      screens: { type: "array", items: { type: "string" } },
      components: { type: "array", items: { type: "string" } },
      interactionStates: { type: "array", items: { type: "string" } },
    },
    required: ["screens", "components", "interactionStates"],
  };

  async execute(
    input: UIGeneratorInput
  ): Promise<AgentExecutionResult<UIGeneratorOutput>> {
    const output: UIGeneratorOutput = {
      screens: ["HomeScreen", "InventoryScreen", "UpgradeScreen"],
      components: ["CurrencyBadge", "QuestPanel", "ShopCard"],
      interactionStates: ["Idle", "Selected", "Purchased"],
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
