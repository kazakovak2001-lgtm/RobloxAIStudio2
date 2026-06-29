import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class AssetPlannerAgent extends BaseAgent {
  public readonly name = "AssetPlanner";
  public readonly description = "Plans game assets and resources";
  public readonly inputSchema: Record<string, unknown> = { type: "object", properties: { requirements: { type: "object" }, gameDesign: { type: "object" } }, required: ["requirements", "gameDesign"] };
  public readonly outputSchema: Record<string, unknown> = { type: "object", properties: { assetPlan: { type: "object" } }, required: ["assetPlan"] };
  constructor(config?: Partial<AgentConfig>) { super(config); }
  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return { assetPlan: { models: [], textures: [], audio: [] } };
  }
}
