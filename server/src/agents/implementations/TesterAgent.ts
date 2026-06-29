import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class TesterAgent extends BaseAgent {
  public readonly name = "Tester";
  public readonly description = "Tests generated code";
  public readonly inputSchema: Record<string, unknown> = { type: "object", properties: { generatedCode: { type: "object" }, gameDesign: { type: "object" } }, required: ["generatedCode", "gameDesign"] };
  public readonly outputSchema: Record<string, unknown> = { type: "object", properties: { testResults: { type: "object" } }, required: ["testResults"] };
  constructor(config?: Partial<AgentConfig>) { super(config); }
  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return { testResults: { passed: 0, failed: 0, tests: [] } };
  }
}
