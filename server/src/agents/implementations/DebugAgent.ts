import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class DebugAgent extends BaseAgent {
  public readonly name = "Debug";
  public readonly description = "Debugs and fixes issues";
  public readonly inputSchema: Record<string, unknown> = { type: "object", properties: { generatedCode: { type: "object" }, logs: { type: "array" } }, required: ["generatedCode"] };
  public readonly outputSchema: Record<string, unknown> = { type: "object", properties: { debugReport: { type: "object" } }, required: ["debugReport"] };
  constructor(config?: Partial<AgentConfig>) { super(config); }
  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return { debugReport: { issues: [], fixes: [] } };
  }
}
