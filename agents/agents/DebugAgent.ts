import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface DebugInput {
  prompt: string;
}

interface DebugOutput {
  rootCauses: string[];
  mitigationSteps: string[];
  escalationPath: string[];
}

export class DebugAgent extends AgentBase<DebugInput, DebugOutput> {
  readonly name = "DebugAgent";
  readonly description =
    "Investigates failures and proposes mitigation steps for the pipeline.";
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
      rootCauses: { type: "array", items: { type: "string" } },
      mitigationSteps: { type: "array", items: { type: "string" } },
      escalationPath: { type: "array", items: { type: "string" } },
    },
    required: ["rootCauses", "mitigationSteps", "escalationPath"],
  };

  async execute(input: DebugInput): Promise<AgentExecutionResult<DebugOutput>> {
    const output: DebugOutput = {
      rootCauses: [
        "Failed schema validation",
        "Provider timeout",
        "Unavailable dependency",
      ],
      mitigationSteps: [
        "Retry the current agent",
        "Inspect provider logs",
        "Escalate to orchestration",
      ],
      escalationPath: ["Agent", "Orchestrator", "Platform Support"],
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
