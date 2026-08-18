import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import { summariseForPrompt } from "../../ai/promptValues";
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
      // FIRST-PLAYABLE-1 (FP-1A). The generated level this architecture is
      // for. Not in `required`: a run whose model omits it still produces a
      // valid architecture, and the Lua generator falls back to the
      // unpositioned slice it built before this slice existed. Failing the
      // whole stage on a missing level would make every generation depend on
      // one more thing the model has to get right in a single response.
      spatialDesign: { type: "object" },
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
    // FP-1A. The level is designed from what the player asked for, so the
    // brief has to reach this stage; without it the architect can only lay out
    // a map for a game it cannot describe.
    const description = String(
      bp?.description ?? "Create a playable Roblox game",
    );
    const gameType = String(bp?.game_type ?? "adventure");
    const estimatedPlayers = String(bp?.estimated_players ?? "small-group");

    const mechanicsArr = (gameplay as any)?.mechanics;
    // SERIALIZATION-001. Same fallback, same loss: an unnamed mechanic became
    // `[object Object]` in the prompt that designs the architecture.
    const systemsSummary = Array.isArray(mechanicsArr)
      ? summariseForPrompt(mechanicsArr.slice(0, 5), "core gameplay systems")
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
      description,
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
