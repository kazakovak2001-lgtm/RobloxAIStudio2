import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class RobloxArchitectAgent extends BaseAgent {
  public readonly name = "RobloxArchitect";
  public readonly description = "Designs Roblox-specific architecture";
  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: { gameDesign: { type: "object" } },
    required: ["gameDesign"],
  };
  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { architecture: { type: "object" } },
    required: ["architecture"],
  };
  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }
  protected async process(
    _input: AgentInput,
  ): Promise<Record<string, unknown>> {
    return {
      architecture: {
        folderStructure: {},
        dataModels: {},
        services: {},
        apiContracts: {},
      },
      // Aggregator looks for roblox_architect key in pipeline outputs
      roblox_architect: {
        client_architecture: {},
        server_architecture: {},
        networking: {},
      },
    };
  }
}
