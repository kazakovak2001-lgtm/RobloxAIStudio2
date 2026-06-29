import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface PerformanceInput {
  prompt: string;
}

interface PerformanceOutput {
  targets: string[];
  optimizations: string[];
  warnings: string[];
}

export class PerformanceAgent extends AgentBase<
  PerformanceInput,
  PerformanceOutput
> {
  readonly name = "PerformanceAgent";
  readonly description =
    "Defines performance goals and optimization recommendations for the pipeline.";
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
      targets: { type: "array", items: { type: "string" } },
      optimizations: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["targets", "optimizations", "warnings"],
  };

  async execute(
    input: PerformanceInput
  ): Promise<AgentExecutionResult<PerformanceOutput>> {
    const output: PerformanceOutput = {
      targets: ["Low latency", "Low token churn", "Consistent retries"],
      optimizations: [
        "Cache intermediate outputs",
        "Reduce redundant prompts",
        "Batch dependent work",
      ],
      warnings: [
        "Large prompts may increase cost",
        "Provider response quality may vary",
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
