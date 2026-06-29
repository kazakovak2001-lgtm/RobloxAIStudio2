import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class DatabaseAgent extends BaseAgent {
  public readonly name = "Database";
  public readonly description = "Designs database schema";
  public readonly inputSchema: Record<string, unknown> = { type: "object", properties: { requirements: { type: "object" }, gameDesign: { type: "object" } }, required: ["requirements", "gameDesign"] };
  public readonly outputSchema: Record<string, unknown> = { type: "object", properties: { database: { type: "object" } }, required: ["database"] };
  constructor(config?: Partial<AgentConfig>) { super(config); }
  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return { database: { tables: [], relationships: [] } };
  }
}
