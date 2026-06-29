import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface OrchestratorInput {
  prompt: string;
  pipeline: string[];
}

interface OrchestratorOutput {
  pipeline: string[];
  status: "ready" | "blocked";
  summary: string;
}

export class OrchestratorAgent extends AgentBase<
  OrchestratorInput,
  OrchestratorOutput
> {
  readonly name = "Orchestrator";
  readonly description =
    "Coordinates the AI pipeline and decides the execution order of agents.";
  readonly inputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      prompt: { type: "string" },
      pipeline: { type: "array", items: { type: "string" } },
    },
    required: ["prompt", "pipeline"],
  };

  readonly outputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      pipeline: { type: "array", items: { type: "string" } },
      status: { type: "string" },
      summary: { type: "string" },
    },
    required: ["pipeline", "status", "summary"],
  };

  async execute(
    input: OrchestratorInput
  ): Promise<AgentExecutionResult<OrchestratorOutput>> {
    const output: OrchestratorOutput = {
      pipeline: input.pipeline,
      status: "ready",
      summary: `Prepared an execution plan for ${input.pipeline.length} stages based on: ${input.prompt}`,
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
