import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface GameDesignerInput {
  prompt: string;
  requirements?: {
    goals?: string[];
  };
}

interface GameDesignerOutput {
  coreLoop: string[];
  progression: string[];
  economy: string[];
}

export class GameDesignerAgent extends AgentBase<
  GameDesignerInput,
  GameDesignerOutput
> {
  readonly name = "GameDesignerAgent";
  readonly description =
    "Designs the game loop, progression, and core systems.";
  readonly inputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      prompt: { type: "string" },
      requirements: { type: "object" },
    },
    required: ["prompt"],
  };

  readonly outputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      coreLoop: { type: "array", items: { type: "string" } },
      progression: { type: "array", items: { type: "string" } },
      economy: { type: "array", items: { type: "string" } },
    },
    required: ["coreLoop", "progression", "economy"],
  };

  async execute(
    input: GameDesignerInput
  ): Promise<AgentExecutionResult<GameDesignerOutput>> {
    const output: GameDesignerOutput = {
      coreLoop: [
        "Complete objectives",
        "Collect rewards",
        "Unlock new systems",
      ],
      progression: [
        "Early-game onboarding",
        "Mid-game mastery",
        "Late-game prestige",
      ],
      economy: ["Currency sinks", "Unlock systems", "Reward cadence"],
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
