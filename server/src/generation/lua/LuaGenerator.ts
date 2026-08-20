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

/**
 * Deterministic colour cycles for objectives and biome zones, so a
 * multi-mechanic, multi-biome world is visually distinguishable in Studio
 * rather than every generated Part looking the same.
 */
const OBJECTIVE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [230, 126, 34],
  [231, 76, 60],
  [26, 188, 156],
  [241, 196, 15],
  [155, 89, 182],
];

const BIOME_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [87, 161, 74],
  [219, 190, 86],
  [97, 151, 206],
  [150, 111, 214],
];

function color3(rgb: readonly [number, number, number]): string {
  return `Color3.fromRGB(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
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
   * GEN-FIDELITY-1. The one server Script the playable-Lua contract
   * (types/playableLua.ts, already the gate for the other generation
   * pipeline's Studio delivery) requires to own the complete world, the
   * gameplay interaction, and the progress event in one place.
   *
   * Materializes the blueprint rather than a single touched cube: one
   * interactable objective per blueprint mechanic (GEN-VIABILITY-2 wired
   * only the first), completed in order — mirroring coreLoop as a repeating
   * discover→engage→reward cycle — with reward paid in the blueprint's
   * economy currency and progression tracked against progression.stages.
   * One zone per blueprint biome, plus a landmark Part per blueprint
   * landmark when the blueprint names any, gives the world visible
   * differentiation instead of one undifferentiated baseplate. Nothing here
   * is a placeholder — every line is instructions the server actually
   * executes when the place runs.
   */
  private generateGameManager(bp: RobloxGameBlueprint): LuaScript {
    const title = luaString(bp.title);
    const mechanics = bp.mechanics.length > 0 ? bp.mechanics : ["objective"];
    const coreLoop = bp.coreLoop.length > 0 ? bp.coreLoop : ["loop"];
    const stages =
      bp.progression.stages.length > 0 ? bp.progression.stages : ["stage"];
    const biomes = bp.world.biomes;
    const landmarks = bp.world.landmarks;

    const objectiveEntries = mechanics.map((mechanic, index) => {
      const loopStage = luaString(coreLoop[index % coreLoop.length]);
      const reward = (index + 1) * 25;
      return `\t{ name = "${luaString(mechanic)}", loopStage = "${loopStage}", reward = ${reward} },`;
    });

    const stageEntries = stages
      .map((stage) => `"${luaString(stage)}"`)
      .join(", ");

    const biomeZones: string[] = [];
    biomes.forEach((biome, index) => {
      const varName = `biomeZone${index + 1}`;
      biomeZones.push(
        `local ${varName} = Instance.new("Part")`,
        `${varName}.Name = "${luaString(biome)}_Zone"`,
        `${varName}.Size = Vector3.new(80, 1, 80)`,
        `${varName}.Position = Vector3.new(${index * 100}, 0, -60)`,
        `${varName}.Color = ${color3(BIOME_COLORS[index % BIOME_COLORS.length])}`,
        `${varName}.Anchored = true`,
        `${varName}.Parent = workspace`,
        ``,
      );
    });

    const landmarkParts: string[] = [];
    landmarks.forEach((landmark, index) => {
      const varName = `landmark${index + 1}`;
      landmarkParts.push(
        `local ${varName} = Instance.new("Part")`,
        `${varName}.Name = "${luaString(landmark)}_Landmark"`,
        `${varName}.Size = Vector3.new(6, 20, 6)`,
        `${varName}.Position = Vector3.new(${250 + index * 50}, 10, -50)`,
        `${varName}.Color = Color3.fromRGB(200, 200, 200)`,
        `${varName}.Anchored = true`,
        `${varName}.Parent = workspace`,
        ``,
      );
    });

    const objectiveParts: string[] = [];
    mechanics.forEach((mechanic, index) => {
      const varName = `objectivePart${index + 1}`;
      objectiveParts.push(
        `local ${varName} = Instance.new("Part")`,
        `${varName}.Name = "${luaString(mechanic)}_Interactable"`,
        `${varName}.Size = Vector3.new(4, 4, 4)`,
        `${varName}.Position = Vector3.new(${index * 15}, 2, 30)`,
        `${varName}.Color = ${color3(OBJECTIVE_COLORS[index % OBJECTIVE_COLORS.length])}`,
        `${varName}.Anchored = true`,
        `${varName}.Parent = workspace`,
        `${varName}.Touched:Connect(function(hit)`,
        `\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)`,
        `\tif not player then`,
        `\t\treturn`,
        `\tend`,
        `\tonObjectiveTouched(player, ${index + 1})`,
        `end)`,
        ``,
      );
    });

    const lines: string[] = [
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
      `-- World differentiation: one zone per blueprint biome`,
      ...biomeZones,
    ];

    if (landmarkParts.length > 0) {
      lines.push(`-- Landmarks named by the blueprint`, ...landmarkParts);
    }

    lines.push(
      `local progressEvent = Instance.new("RemoteEvent")`,
      `progressEvent.Name = "ProgressUpdated"`,
      `progressEvent.Parent = ReplicatedStorage`,
      ``,
      `-- Objectives: one per blueprint mechanic, completed in coreLoop order`,
      `local OBJECTIVES = {`,
      ...objectiveEntries,
      `}`,
      `local PROGRESSION_STAGES = {${stageEntries}}`,
      `local TOTAL_OBJECTIVES = #OBJECTIVES`,
      ``,
      `local playerProgress = {}`,
      `local playerCoins = {}`,
      ``,
      `Players.PlayerAdded:Connect(function(player)`,
      `\tplayerProgress[player.UserId] = 1`,
      `\tplayerCoins[player.UserId] = 0`,
      `end)`,
      ``,
      `Players.PlayerRemoving:Connect(function(player)`,
      `\tplayerProgress[player.UserId] = nil`,
      `\tplayerCoins[player.UserId] = nil`,
      `end)`,
      ``,
      `local function stageForProgress(completedCount)`,
      `\tlocal ratio = completedCount / TOTAL_OBJECTIVES`,
      `\tlocal index = math.max(1, math.min(#PROGRESSION_STAGES, math.ceil(ratio * #PROGRESSION_STAGES)))`,
      `\treturn PROGRESSION_STAGES[index]`,
      `end`,
      ``,
      `-- Server-authoritative: the client only touches a Part, the server`,
      `-- alone decides whether that advances progress and what it pays out.`,
      `local function onObjectiveTouched(player, objectiveIndex)`,
      `\tlocal progress = playerProgress[player.UserId] or 1`,
      `\tif objectiveIndex ~= progress then`,
      `\t\treturn`,
      `\tend`,
      `\tlocal objective = OBJECTIVES[objectiveIndex]`,
      `\tplayerProgress[player.UserId] = progress + 1`,
      `\tplayerCoins[player.UserId] = (playerCoins[player.UserId] or 0) + objective.reward`,
      `\tif _G.EconomyService then`,
      `\t\t_G.EconomyService.Award(player.UserId, objective.reward, objective.name)`,
      `\tend`,
      `\tlocal nextObjective = OBJECTIVES[progress + 1]`,
      `\tprogressEvent:FireClient(player, {`,
      `\t\tcompleted = objective.name,`,
      `\t\tloopStage = objective.loopStage,`,
      `\t\tcompletedCount = progress,`,
      `\t\ttotalObjectives = TOTAL_OBJECTIVES,`,
      `\t\tnextObjective = nextObjective and nextObjective.name or "complete",`,
      `\t\tcoins = playerCoins[player.UserId],`,
      `\t\tstage = stageForProgress(progress),`,
      `\t})`,
      `end`,
      ``,
      ...objectiveParts,
      `print("[GameManager] ${title} world ready with " .. TOTAL_OBJECTIVES .. " objectives")`,
    );

    return {
      name: "GameManager",
      type: "server",
      path: "ServerScriptService/GameManager",
      code: lines.join("\n"),
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
   *
   * GEN-FIDELITY-1. Renders every field GameManager's `ProgressUpdated`
   * event carries — which objective completed, how many of the blueprint's
   * objectives remain, the next one, the progression stage, and the reward
   * paid in the blueprint's economy currency — instead of echoing back a
   * single mechanic name.
   */
  private generateClientController(bp: RobloxGameBlueprint): LuaScript {
    const title = luaString(bp.title);
    const mechanics = bp.mechanics.length > 0 ? bp.mechanics : ["objective"];
    const stages =
      bp.progression.stages.length > 0 ? bp.progression.stages : ["stage"];
    const currency = luaString(bp.economy.currency || "coins");

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
        `statusLabel.Size = UDim2.new(0, 360, 0, 60)`,
        `statusLabel.Position = UDim2.new(0, 16, 0, 16)`,
        `statusLabel.Text = "${title} — 0/${mechanics.length} objectives — Stage: ${luaString(stages[0])}"`,
        `statusLabel.Parent = screenGui`,
        ``,
        `screenGui.Parent = player:WaitForChild("PlayerGui")`,
        ``,
        `local progressEvent = ReplicatedStorage:WaitForChild("ProgressUpdated")`,
        `progressEvent.OnClientEvent:Connect(function(data)`,
        `\tif typeof(data) ~= "table" then`,
        `\t\treturn`,
        `\tend`,
        `\tstatusLabel.Text = string.format(`,
        `\t\t"%s complete (%d/%d) | Next: %s | Stage: %s | ${currency}: %d",`,
        `\t\ttostring(data.completed),`,
        `\t\ttonumber(data.completedCount) or 0,`,
        `\t\ttonumber(data.totalObjectives) or 0,`,
        `\t\ttostring(data.nextObjective),`,
        `\t\ttostring(data.stage),`,
        `\t\ttonumber(data.coins) or 0`,
        `\t)`,
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
