import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class DocumentationAgent extends BaseAgent {
  public readonly name = "Documentation";
  public readonly description = "Generates documentation";
  public readonly inputSchema: Record<string, unknown> = { type: "object", properties: { architecture: { type: "object" }, generatedCode: { type: "object" } }, required: ["architecture", "generatedCode"] };
  public readonly outputSchema: Record<string, unknown> = { type: "object", properties: { documentation: { type: "object" } }, required: ["documentation"] };
  constructor(config?: Partial<AgentConfig>) { super(config); }
  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return { documentation: { readme: "", api: {} } };
  }
}
