import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class PlannerAgent extends BaseAgent {
  public readonly name = "Planner";
  public readonly description = "Creates project plans and timelines";
  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: { requirements: { type: "object" } },
    required: ["requirements"],
  };
  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { plan: { type: "object" } },
    required: ["plan"],
  };

  constructor(config?: Partial<AgentConfig>) { super(config); }

  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return { plan: { phases: [], timeline: "TBD" } };
  }
}
