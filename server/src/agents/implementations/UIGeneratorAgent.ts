import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class UIGeneratorAgent extends BaseAgent {
  public readonly name = "UIGenerator";
  public readonly description = "Generates UI designs and layouts";
  public readonly inputSchema: Record<string, unknown> = { type: "object", properties: { gameDesign: { type: "object" }, architecture: { type: "object" } }, required: ["gameDesign", "architecture"] };
  public readonly outputSchema: Record<string, unknown> = { type: "object", properties: { uiDesign: { type: "object" } }, required: ["uiDesign"] };
  constructor(config?: Partial<AgentConfig>) { super(config); }
  protected async process(_input: AgentInput): Promise<Record<string, unknown>> {
    return { uiDesign: { screens: [], components: {} } };
  }
}
