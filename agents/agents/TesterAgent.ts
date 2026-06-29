import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface TesterInput {
  prompt: string;
}

interface TesterOutput {
  testCases: string[];
  qualityGates: string[];
  risks: string[];
}

export class TesterAgent extends AgentBase<TesterInput, TesterOutput> {
  readonly name = "TesterAgent";
  readonly description =
    "Designs test scenarios and quality gates for future implementations.";
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
      testCases: { type: "array", items: { type: "string" } },
      qualityGates: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["testCases", "qualityGates", "risks"],
  };

  async execute(
    input: TesterInput
  ): Promise<AgentExecutionResult<TesterOutput>> {
    const output: TesterOutput = {
      testCases: [
        "Core loop smoke test",
        "Progression verification",
        "UI interaction regression",
      ],
      qualityGates: [
        "Schema validation",
        "Provider compatibility",
        "Failure tolerance",
      ],
      risks: ["Partial implementation", "Unstable provider responses"],
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
