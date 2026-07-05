import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class RobloxArchitectAgent extends BaseAgent {
  public readonly name = "RobloxArchitect";
  public readonly description =
    "Designs Roblox client/server architecture and data models";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      gameplay: { type: "object" },
      blueprint: { type: "object" },
      requirements: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      architecture: { type: "object" },
      roblox_architect: { type: "object" },
    },
    required: ["architecture", "roblox_architect"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const gameplay = input.gameplay as Record<string, unknown> | undefined;

    const name = String(bp?.name ?? "Unnamed Game");
    const gameType = String(bp?.game_type ?? "adventure");
    const estimatedPlayers = String(bp?.estimated_players ?? "small-group");

    const mechanicsArr = (gameplay as any)?.mechanics;
    const systemsSummary = Array.isArray(mechanicsArr)
      ? mechanicsArr
          .slice(0, 5)
          .map((m: any) => String(m?.name ?? m))
          .join(", ")
      : "core gameplay systems";

    const fallback: Record<string, unknown> = {
      architecture: {
        folderStructure: {
          ServerScriptService: ["GameManager", "DataService", "PlayerService"],
          ReplicatedStorage: ["Shared", "Remotes", "Assets"],
          StarterPlayerScripts: ["LocalController", "UIManager"],
        },
        dataModels: {
          PlayerData: {
            currency: "number",
            level: "number",
            inventory: "table",
          },
          GameState: { phase: "string", activeCount: "number" },
        },
        services: {
          DataService: "Handles DataStore read/write with caching",
          EventService: "Central RemoteEvent / RemoteFunction broker",
          SpawnService: "Manages player spawn points and respawning",
        },
        apiContracts: {
          "Player.Join": { input: "UserId", output: "PlayerData" },
          "Game.StateChange": { input: "phase", output: "broadcast" },
        },
      },
      roblox_architect: {
        client_architecture: {
          main_loop_frequency: 60,
          rendering_engine: "Roblox default",
          physics_engine: "Roblox Workspace",
        },
        server_architecture: {
          replication_model: "Server-authoritative",
          update_rate: 20,
          persistence_strategy: "DataStore2 with retry",
        },
        networking: {
          protocol: "Roblox RemoteEvents",
          bandwidth_optimization: "Delta compression",
          latency_handling: "Client-side prediction",
        },
      },
    };

    if (!this.llm) return fallback;

    const registryPrompt = this.buildPrompt({
      name,
      game_type: gameType,
      estimated_players: estimatedPlayers,
      systems_summary: systemsSummary,
    });

    const inlinePrompt =
      "You are a Roblox Studio technical architect. " +
      "Respond with a single JSON object:\n" +
      '{ "architecture": { "folderStructure": object, "dataModels": object, ' +
      '"services": object, "apiContracts": object }, ' +
      '"roblox_architect": { "client_architecture": { "main_loop_frequency": number, ' +
      '"rendering_engine": string, "physics_engine": string }, ' +
      '"server_architecture": { "replication_model": string, "update_rate": number, ' +
      '"persistence_strategy": string }, ' +
      '"networking": { "protocol": string, "bandwidth_optimization": string, "latency_handling": string } } }\n\n' +
      `Game: ${name}\nGame Type: ${gameType}\nEstimated Players: ${estimatedPlayers}\n` +
      `Key Systems: ${systemsSummary}\n\nReturn only valid JSON.`;

    const prompt = registryPrompt ?? inlinePrompt;

    return this.generateWithRetry(
      prompt,
      ["architecture", "roblox_architect"],
      fallback,
      { temperature: 0.3, maxTokens: 1800 },
    );
  }
}
