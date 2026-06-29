import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface RobloxArchitectInput {
  prompt: string;
  design?: {
    coreLoop?: string[];
    progression?: string[];
  };
}

interface RobloxArchitectOutput {
  modules: string[];
  services: string[];
  interfaces: string[];
}

export class RobloxArchitectAgent extends AgentBase<
  RobloxArchitectInput,
  RobloxArchitectOutput
> {
  readonly name = "RobloxArchitectAgent";
  readonly description =
    "Defines the structural architecture for the future Roblox implementation.";
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
      modules: { type: "array", items: { type: "string" } },
      services: { type: "array", items: { type: "string" } },
      interfaces: { type: "array", items: { type: "string" } },
    },
    required: ["modules", "services", "interfaces"],
  };

  async execute(
    input: RobloxArchitectInput
  ): Promise<AgentExecutionResult<RobloxArchitectOutput>> {
    const output: RobloxArchitectOutput = {
      modules: ["GameplayModule", "EconomyModule", "ProgressionModule"],
      services: ["SessionService", "InventoryService", "ProgressService"],
      interfaces: ["GameEventBus", "StateStore", "TelemetryCollector"],
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
