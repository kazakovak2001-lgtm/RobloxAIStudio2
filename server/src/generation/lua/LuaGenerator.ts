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

  private generateGameManager(bp: RobloxGameBlueprint): LuaScript {
    const mechanics = bp.mechanics.map((m) => `\t["${m}"] = true,`).join("\n");
    return {
      name: "GameManager",
      type: "server",
      path: "ServerScriptService/GameManager",
      code: `-- GameManager: ${bp.title}\nlocal GameManager = {}\n\nGameManager.MECHANICS = {\n${mechanics}\n}\n\nfunction GameManager:Init()\n\tprint("[GameManager] ${bp.title} initialized")\nend\n\nfunction GameManager:GetCoreLoop()\n\treturn {${bp.coreLoop.map((s) => `"${s}"`).join(", ")}}\nend\n\nreturn GameManager`,
    };
  }

  private generatePlayerService(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "PlayerService",
      type: "server",
      path: "ServerScriptService/PlayerService",
      code: `-- PlayerService: manages player state\nlocal Players = game:GetService("Players")\nlocal PlayerService = {}\n\nPlayerService.PlayerData = {}\n\nfunction PlayerService:OnPlayerJoin(player)\n\tself.PlayerData[player.UserId] = {\n\t\tlevel = 1,\n\t\t${bp.economy.currency} = 0,\n\t\tstage = "${bp.progression.stages[0]}"\n\t}\n\tprint("[PlayerService] " .. player.Name .. " joined")\nend\n\nPlayers.PlayerAdded:Connect(function(p) PlayerService:OnPlayerJoin(p) end)\n\nreturn PlayerService`,
    };
  }

  private generateEconomyService(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "EconomyService",
      type: "server",
      path: "ServerScriptService/EconomyService",
      code: `-- EconomyService: ${bp.economy.balanceStrategy}\nlocal EconomyService = {}\n\nEconomyService.CURRENCY = "${bp.economy.currency}"\nEconomyService.SOURCES = {${bp.economy.sources.map((s) => `"${s}"`).join(", ")}}\nEconomyService.SINKS = {${bp.economy.sinks.map((s) => `"${s}"`).join(", ")}}\n\nfunction EconomyService:Award(playerId, amount, source)\n\t-- Award currency to player\n\tprint("[Economy] +" .. amount .. " " .. self.CURRENCY .. " from " .. source)\nend\n\nfunction EconomyService:Spend(playerId, amount, sink)\n\t-- Deduct currency\n\tprint("[Economy] -" .. amount .. " " .. self.CURRENCY .. " on " .. sink)\nend\n\nreturn EconomyService`,
    };
  }

  private generateClientController(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "ClientController",
      type: "client",
      path: "StarterPlayerScripts/ClientController",
      code: `-- ClientController: ${bp.title}\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal ClientController = {}\n\nfunction ClientController:Init()\n\tprint("[Client] ${bp.title} client ready")\nend\n\nClientController:Init()\n\nreturn ClientController`,
    };
  }

  private generateUIController(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "UIController",
      type: "client",
      path: "StarterPlayerScripts/UIController",
      code: `-- UIController: HUD management\nlocal UIController = {}\n\nfunction UIController:ShowHUD()\n\t-- Display ${bp.economy.currency} counter, health, minimap\n\tprint("[UI] HUD displayed")\nend\n\nfunction UIController:ShowMenu()\n\tprint("[UI] Menu opened")\nend\n\nreturn UIController`,
    };
  }

  private generateGameConfig(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "GameConfig",
      type: "shared",
      path: "ReplicatedStorage/Shared/GameConfig",
      code: `-- GameConfig: ${bp.title}\nlocal GameConfig = {\n\tTITLE = "${bp.title}",\n\tGENRE = "${bp.genre}",\n\tVERSION = "1.0.0",\n\tMAP_SIZE = "${bp.world.size}",\n\tMAX_NPCS = ${bp.npcs.length},\n}\n\nreturn GameConfig`,
    };
  }

  private generateConstants(bp: RobloxGameBlueprint): LuaScript {
    return {
      name: "Constants",
      type: "shared",
      path: "ReplicatedStorage/Shared/Constants",
      code: `-- Constants: game-wide enums and values\nlocal Constants = {\n\tSTAGES = {${bp.progression.stages.map((s) => `"${s}"`).join(", ")}},\n\tBIOMES = {${bp.world.biomes.map((b) => `"${b}"`).join(", ")}},\n\tCURRENCY = "${bp.economy.currency}",\n}\n\nreturn Constants`,
    };
  }
}
