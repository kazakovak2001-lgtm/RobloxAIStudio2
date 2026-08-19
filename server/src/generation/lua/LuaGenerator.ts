/**
 * LuaGenerator.ts
 *
 * Converts a GameBlueprint into Roblox Lua (Luau) scripts.
 * Produces: server scripts, client scripts, shared modules.
 * Deterministic: same blueprint → same output structure.
 */

import type { RobloxGameBlueprint } from "../blueprint/GameBlueprintEngine";

export interface LuaScript {
  name: string;
  type: "server" | "client" | "shared";
  path: string;
  code: string;
}

export interface LuaGenerationResult {
  blueprintId: string;
  scripts: LuaScript[];
  totalScripts: number;
  totalLines: number;
}

/**
 * Escape a value for embedding inside a double-quoted Luau string literal.
 * Blueprint fields (title, genre, currency, mechanic/biome names, ...) are
 * plan/AI output, not code the generator controls — an unescaped `"` or `\`
 * in one of them currently produces a Lua file that fails to parse.
 */
function luaString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

export class LuaGenerator {
  /**
   * Generate all Lua scripts from a game blueprint.
   */
  generate(blueprint: RobloxGameBlueprint): LuaGenerationResult {
    const scripts: LuaScript[] = [];

    // Server scripts
    scripts.push(this.generateGameManager(blueprint));
    scripts.push(this.generatePlayerService(blueprint));
    scripts.push(this.generateEconomyService(blueprint));

    // Client scripts
    scripts.push(this.generateClientController(blueprint));
    scripts.push(this.generateUIController(blueprint));

    // Shared modules
    scripts.push(this.generateGameConfig(blueprint));
    scripts.push(this.generateConstants(blueprint));

    const totalLines = scripts.reduce(
      (sum, s) => sum + s.code.split("\n").length,
      0,
    );

    console.log(
      `[LUA-GEN] Generated | Blueprint: ${blueprint.id} | Scripts: ${scripts.length} | Lines: ${totalLines}`,
    );

    return {
      blueprintId: blueprint.id,
      scripts,
      totalScripts: scripts.length,
      totalLines,
    };
  }

  /**
   * GEN-VIABILITY-2. The one server Script the playable-Lua contract
   * (types/playableLua.ts, already the gate for the other generation
   * pipeline's Studio delivery) requires to own the complete world, the
   * gameplay interaction, and the progress event in one place: it builds
   * real Workspace geometry, wires a Touched interaction on the blueprint's
   * first mechanic, and fires a RemoteEvent the client HUD listens for.
   * Nothing here is a placeholder — every line is instructions the server
   * actually executes when the place runs.
   */
  private generateGameManager(bp: RobloxGameBlueprint): LuaScript {
    const mechanicName = luaString(bp.mechanics[0] ?? "objective");
    const title = luaString(bp.title);
    return {
      name: "GameManager",
      type: "server",
      path: "ServerScriptService/GameManager",
      code: [
        `-- GameManager: ${bp.title}`,
        `local ReplicatedStorage = game:GetService("ReplicatedStorage")`,
        `local Players = game:GetService("Players")`,
        ``,
        `local baseplate = Instance.new("Part")`,
        `baseplate.Name = "Baseplate"`,
        `baseplate.Size = Vector3.new(200, 4, 200)`,
        `baseplate.Position = Vector3.new(0, -2, 0)`,
        `baseplate.Anchored = true`,
        `baseplate.Parent = workspace`,
        ``,
        `local spawnPoint = Instance.new("SpawnLocation")`,
        `spawnPoint.Name = "MainSpawn"`,
        `spawnPoint.Size = Vector3.new(6, 1, 6)`,
        `spawnPoint.Position = Vector3.new(0, 1, 0)`,
        `spawnPoint.Anchored = true`,
        `spawnPoint.Parent = workspace`,
        ``,
        `local objective = Instance.new("Part")`,
        `objective.Name = "${mechanicName}_Interactable"`,
        `objective.Size = Vector3.new(4, 4, 4)`,
        `objective.Position = Vector3.new(15, 2, 15)`,
        `objective.Anchored = true`,
        `objective.Parent = workspace`,
        ``,
        `local progressEvent = Instance.new("RemoteEvent")`,
        `progressEvent.Name = "ProgressUpdated"`,
        `progressEvent.Parent = ReplicatedStorage`,
        ``,
        `objective.Touched:Connect(function(hit)`,
        `\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)`,
        `\tif not player then`,
        `\t\treturn`,
        `\tend`,
        `\tprogressEvent:FireClient(player, { mechanic = "${mechanicName}", title = "${title}" })`,
        `end)`,
        ``,
        `print("[GameManager] ${title} world ready")`,
      ].join("\n"),
    };
  }

  private generatePlayerService(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "PlayerService",
      type: "server",
      path: "ServerScriptService/PlayerService",
      code: [
        `-- PlayerService: manages player state`,
        `local Players = game:GetService("Players")`,
        `local PlayerService = {}`,
        ``,
        `PlayerService.PlayerData = {}`,
        ``,
        `function PlayerService:OnPlayerJoin(player)`,
        `\tself.PlayerData[player.UserId] = {`,
        `\t\tlevel = 1,`,
        `\t\t["${luaString(bp.economy.currency)}"] = 0,`,
        `\t\tstage = "${luaString(bp.progression.stages[0] ?? "")}"`,
        `\t}`,
        `\tprint("[PlayerService] " .. player.Name .. " joined")`,
        `end`,
        ``,
        `Players.PlayerAdded:Connect(function(p) PlayerService:OnPlayerJoin(p) end)`,
      ].join("\n"),
    };
  }

  private generateEconomyService(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "EconomyService",
      type: "server",
      path: "ServerScriptService/EconomyService",
      code: [
        `-- EconomyService: ${bp.economy.balanceStrategy}`,
        `local EconomyService = {}`,
        ``,
        `EconomyService.CURRENCY = "${luaString(bp.economy.currency)}"`,
        `EconomyService.SOURCES = {${bp.economy.sources.map((s) => `"${luaString(s)}"`).join(", ")}}`,
        `EconomyService.SINKS = {${bp.economy.sinks.map((s) => `"${luaString(s)}"`).join(", ")}}`,
        ``,
        `function EconomyService.Award(playerId, amount, source)`,
        `\tprint("[Economy] +" .. amount .. " " .. EconomyService.CURRENCY .. " from " .. source)`,
        `end`,
        ``,
        `function EconomyService.Spend(playerId, amount, sink)`,
        `\tprint("[Economy] -" .. amount .. " " .. EconomyService.CURRENCY .. " on " .. sink)`,
        `end`,
        ``,
        `_G.EconomyService = EconomyService`,
      ].join("\n"),
    };
  }

  /**
   * The one client LocalScript the playable-Lua contract requires: it must
   * build the HUD before it wires up progress, use LocalPlayer, and parent
   * the ScreenGui under PlayerGui.
   */
  private generateClientController(bp: RobloxGameBlueprint): LuaScript {
    const mechanicName = luaString(bp.mechanics[0] ?? "objective");
    const title = luaString(bp.title);
    return {
      name: "ClientController",
      type: "client",
      path: "StarterPlayerScripts/ClientController",
      code: [
        `-- ClientController: ${bp.title}`,
        `local Players = game:GetService("Players")`,
        `local ReplicatedStorage = game:GetService("ReplicatedStorage")`,
        `local player = Players.LocalPlayer`,
        ``,
        `local screenGui = Instance.new("ScreenGui")`,
        `screenGui.Name = "HUD"`,
        ``,
        `local statusLabel = Instance.new("TextLabel")`,
        `statusLabel.Size = UDim2.new(0, 220, 0, 44)`,
        `statusLabel.Position = UDim2.new(0, 16, 0, 16)`,
        `statusLabel.Text = "${title} ready"`,
        `statusLabel.Parent = screenGui`,
        ``,
        `screenGui.Parent = player:WaitForChild("PlayerGui")`,
        ``,
        `local progressEvent = ReplicatedStorage:WaitForChild("ProgressUpdated")`,
        `progressEvent.OnClientEvent:Connect(function(data)`,
        `\tstatusLabel.Text = "${mechanicName}: " .. tostring(data and data.mechanic or "")`,
        `end)`,
        ``,
        `print("[Client] ${title} client ready")`,
      ].join("\n"),
    };
  }

  private generateUIController(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "UIController",
      type: "client",
      path: "StarterPlayerScripts/UIController",
      code: [
        `-- UIController: supplementary client diagnostics for ${bp.title}`,
        `local RunService = game:GetService("RunService")`,
        ``,
        `local frameCount = 0`,
        `RunService.Heartbeat:Connect(function()`,
        `\tframeCount += 1`,
        `end)`,
        ``,
        `print("[UI] Supplementary controller ready")`,
      ].join("\n"),
    };
  }

  private generateGameConfig(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "GameConfig",
      type: "shared",
      path: "ReplicatedStorage/Shared/GameConfig",
      code: `-- GameConfig: ${bp.title}\nlocal GameConfig = {\n\tTITLE = "${luaString(bp.title)}",\n\tGENRE = "${luaString(bp.genre)}",\n\tVERSION = "1.0.0",\n\tMAP_SIZE = "${luaString(bp.world.size)}",\n\tMAX_NPCS = ${bp.npcs.length},\n}\n\nreturn GameConfig`,
    };
  }

  private generateConstants(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "Constants",
      type: "shared",
      path: "ReplicatedStorage/Shared/Constants",
      code: `-- Constants: game-wide enums and values\nlocal Constants = {\n\tSTAGES = {${bp.progression.stages.map((s) => `"${luaString(s)}"`).join(", ")}},\n\tBIOMES = {${bp.world.biomes.map((b) => `"${luaString(b)}"`).join(", ")}},\n\tCURRENCY = "${luaString(bp.economy.currency)}",\n}\n\nreturn Constants`,
    };
  }
}
