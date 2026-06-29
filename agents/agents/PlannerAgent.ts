import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface PlannerInput {
  prompt: string;
  requirements?: {
    scope?: string[];
    goals?: string[];
    constraints?: string[];
  };
}

interface PlannerOutput {
  milestones: string[];
  dependencies: string[];
  risks: string[];
}

export class PlannerAgent extends AgentBase<PlannerInput, PlannerOutput> {
  readonly name = "PlannerAgent";
  readonly description =
    "Breaks high-level ideas into milestones and dependencies.";
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
      milestones: { type: "array", items: { type: "string" } },
      dependencies: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["milestones", "dependencies", "risks"],
  };

  async execute(
    input: PlannerInput
  ): Promise<AgentExecutionResult<PlannerOutput>> {
    const output: PlannerOutput = {
      milestones: [
        "Define game loop",
        "Outline progression",
        "Prepare implementation backlog",
      ],
      dependencies: ["RequirementsAgent", "GameDesignerAgent"],
      risks: ["Future backend integration", "Model provider variability"],
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
