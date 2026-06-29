import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class RequirementsAgent extends BaseAgent {
  public readonly name = "Requirements";
  public readonly description = "Analyzes and extracts game requirements";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      prompt: { type: "string" },
    },
    required: ["prompt"],
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      requirements: { type: "object" },
    },
    required: ["requirements"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return {
      requirements: {
        coreConcept: "Game concept",
        genre: "Adventure",
        keyFeatures: [],
      },
    };
  }
}
