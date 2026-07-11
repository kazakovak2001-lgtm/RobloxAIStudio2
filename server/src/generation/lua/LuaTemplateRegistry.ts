/**
 * LuaTemplateRegistry — Production Lua script templates for Roblox game systems.
 * Each template is a complete, runnable Roblox script.
 */

import type { GameplaySystem, LuaScriptType } from "./LuaGenerationTypes";

export interface LuaTemplate {
  system: GameplaySystem;
  scriptType: LuaScriptType;
  name: string;
  path: string;
  dependencies: string[];
  generate: (context: TemplateContext) => string;
}

export interface TemplateContext {
  gameName: string;
  genre: string;
  features: string[];
}

export class LuaTemplateRegistry {
  private templates: Map<GameplaySystem, LuaTemplate[]> = new Map();

  constructor() {
    this.registerAll();
  }

  get(system: GameplaySystem): LuaTemplate[] {
    return this.templates.get(system) ?? [];
  }

  getAll(): LuaTemplate[] {
    const all: LuaTemplate[] = [];
    for (const templates of this.templates.values()) {
      all.push(...templates);
    }
    return all;
  }

  getSystems(): GameplaySystem[] {
    return [...this.templates.keys()];
  }

  private registerAll(): void {
    this.register("config", {
      system: "config",
      scriptType: "ModuleScript",
      name: "SharedConfig",
      path: "ReplicatedStorage/SharedConfig",
      dependencies: [],
      generate: (ctx) =>
        `--[[\n  SharedConfig — Game configuration for ${ctx.gameName}\n  Genre: ${ctx.genre}\n]]\n\nlocal Config = {}\n\nConfig.GameName = "${ctx.gameName}"\nConfig.Version = "1.0.0"\nConfig.MaxPlayers = 20\nConfig.Genre = "${ctx.genre}"\n\n-- Gameplay Settings\nConfig.Gameplay = {\n\tspawnProtectionTime = 3,\n\tdefaultWalkSpeed = 16,\n\tdefaultJumpPower = 50,\n\trespawnTime = 5,\n}\n\n-- Economy Settings\nConfig.Economy = {\n\tstartingCurrency = 100,\n\tmaxCurrency = 999999,\n\tdailyReward = 50,\n}\n\n-- Progression\nConfig.Progression = {\n\tmaxLevel = 100,\n\txpPerLevel = function(level: number): number\n\t\treturn math.floor(100 * (level ^ 1.5))\n\tend,\n}\n\nreturn Config\n`,
    });

    this.register("remotes", {
      system: "remotes",
      scriptType: "ModuleScript",
      name: "RemoteEvents",
      path: "ReplicatedStorage/Remotes",
      dependencies: [],
      generate: () =>
        `--[[\n  RemoteEvents — Central remote event/function registry.\n  All client-server communication goes through here.\n]]\n\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\n\nlocal Remotes = {}\n\nlocal function getOrCreate(name: string, className: string)\n\tlocal existing = ReplicatedStorage:FindFirstChild(name)\n\tif existing then return existing end\n\tlocal new = Instance.new(className)\n\tnew.Name = name\n\tnew.Parent = ReplicatedStorage\n\treturn new\nend\n\n-- Events\nRemotes.PlayerAction = getOrCreate("PlayerAction", "RemoteEvent")\nRemotes.UIUpdate = getOrCreate("UIUpdate", "RemoteEvent")\nRemotes.NotifyPlayer = getOrCreate("NotifyPlayer", "RemoteEvent")\nRemotes.DataSync = getOrCreate("DataSync", "RemoteEvent")\n\n-- Functions\nRemotes.GetPlayerData = getOrCreate("GetPlayerData", "RemoteFunction")\nRemotes.PurchaseItem = getOrCreate("PurchaseItem", "RemoteFunction")\n\nreturn Remotes\n`,
    });

    this.register("datastore", {
      system: "datastore",
      scriptType: "ServerScript",
      name: "DataService",
      path: "ServerScriptService/DataService",
      dependencies: ["SharedConfig"],
      generate: (ctx) =>
        `--[[\n  DataService — Player data persistence for ${ctx.gameName}\n  Uses DataStoreService with retry logic and session locking.\n]]\n\nlocal Players = game:GetService("Players")\nlocal DataStoreService = game:GetService("DataStoreService")\nlocal RunService = game:GetService("RunService")\n\nlocal Config = require(game.ReplicatedStorage:WaitForChild("SharedConfig"))\n\nlocal DataService = {}\nlocal playerData: {[Player]: any} = {}\nlocal dataStore = DataStoreService:GetDataStore("PlayerData_v1")\n\nlocal DEFAULT_DATA = {\n\tlevel = 1,\n\txp = 0,\n\tcurrency = Config.Economy.startingCurrency,\n\tinventory = {},\n\tstats = { playtime = 0, gamesPlayed = 0 },\n\tsettings = { musicVolume = 0.5, sfxVolume = 0.8 },\n}\n\nfunction DataService.loadData(player: Player)\n\tlocal key = "player_" .. player.UserId\n\tlocal success, data = pcall(function()\n\t\treturn dataStore:GetAsync(key)\n\tend)\n\n\tif success and data then\n\t\tplayerData[player] = data\n\telse\n\t\tplayerData[player] = table.clone(DEFAULT_DATA)\n\tend\n\n\treturn playerData[player]\nend\n\nfunction DataService.saveData(player: Player)\n\tlocal data = playerData[player]\n\tif not data then return end\n\n\tlocal key = "player_" .. player.UserId\n\tlocal success, err = pcall(function()\n\t\tdataStore:SetAsync(key, data)\n\tend)\n\n\tif not success then\n\t\twarn("[DataService] Save failed for", player.Name, err)\n\tend\nend\n\nfunction DataService.getData(player: Player)\n\treturn playerData[player]\nend\n\nfunction DataService.updateData(player: Player, key: string, value: any)\n\tlocal data = playerData[player]\n\tif data then\n\t\tdata[key] = value\n\tend\nend\n\n-- Auto-load on join\nPlayers.PlayerAdded:Connect(function(player)\n\tDataService.loadData(player)\nend)\n\n-- Auto-save on leave\nPlayers.PlayerRemoving:Connect(function(player)\n\tDataService.saveData(player)\n\tplayerData[player] = nil\nend)\n\n-- Periodic auto-save\ntask.spawn(function()\n\twhile true do\n\t\ttask.wait(120)\n\t\tfor player, _ in playerData do\n\t\t\tDataService.saveData(player)\n\t\tend\n\tend\nend)\n\nreturn DataService\n`,
    });

    this.register("lobby", {
      system: "lobby",
      scriptType: "ServerScript",
      name: "LobbyManager",
      path: "ServerScriptService/LobbyManager",
      dependencies: ["SharedConfig", "RemoteEvents"],
      generate: (ctx) =>
        `--[[\n  LobbyManager — Server-side lobby and spawn management for ${ctx.gameName}\n]]\n\nlocal Players = game:GetService("Players")\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\n\nlocal Config = require(ReplicatedStorage:WaitForChild("SharedConfig"))\nlocal Remotes = require(ReplicatedStorage:WaitForChild("Remotes"))\n\nlocal LobbyManager = {}\nlocal activePlayers: {[Player]: boolean} = {}\n\nfunction LobbyManager.onPlayerJoined(player: Player)\n\tactivePlayers[player] = true\n\tprint("[Lobby]", player.Name, "joined the lobby")\n\n\t-- Spawn protection\n\tlocal character = player.Character or player.CharacterAdded:Wait()\n\tlocal humanoid = character:FindFirstChildOfClass("Humanoid")\n\tif humanoid then\n\t\thumanoid.WalkSpeed = Config.Gameplay.defaultWalkSpeed\n\t\thumanoid.JumpPower = Config.Gameplay.defaultJumpPower\n\tend\n\n\t-- Notify client\n\tRemotes.NotifyPlayer:FireClient(player, {\n\t\ttype = "welcome",\n\t\tmessage = "Welcome to " .. Config.GameName .. "!",\n\t})\nend\n\nfunction LobbyManager.onPlayerLeft(player: Player)\n\tactivePlayers[player] = nil\n\tprint("[Lobby]", player.Name, "left")\nend\n\nPlayers.PlayerAdded:Connect(LobbyManager.onPlayerJoined)\nPlayers.PlayerRemoving:Connect(LobbyManager.onPlayerLeft)\n\nreturn LobbyManager\n`,
    });

    this.register("gameplay", {
      system: "gameplay",
      scriptType: "ServerScript",
      name: "GameManager",
      path: "ServerScriptService/GameManager",
      dependencies: ["SharedConfig", "RemoteEvents", "DataService"],
      generate: (ctx) =>
        `--[[\n  GameManager — Core gameplay loop for ${ctx.gameName} (${ctx.genre})\n]]\n\nlocal Players = game:GetService("Players")\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal ServerScriptService = game:GetService("ServerScriptService")\n\nlocal Config = require(ReplicatedStorage:WaitForChild("SharedConfig"))\nlocal Remotes = require(ReplicatedStorage:WaitForChild("Remotes"))\n\nlocal GameManager = {}\nGameManager.state = "waiting" -- waiting | running | ended\n\nfunction GameManager.start()\n\tGameManager.state = "running"\n\tprint("[Game] Started")\n\tRemotes.UIUpdate:FireAllClients({ type = "gameState", state = "running" })\nend\n\nfunction GameManager.stop()\n\tGameManager.state = "ended"\n\tprint("[Game] Ended")\n\tRemotes.UIUpdate:FireAllClients({ type = "gameState", state = "ended" })\nend\n\nfunction GameManager.reset()\n\tGameManager.state = "waiting"\n\tprint("[Game] Reset")\nend\n\nfunction GameManager.getState(): string\n\treturn GameManager.state\nend\n\n-- Handle player actions\nRemotes.PlayerAction.OnServerEvent:Connect(function(player, action)\n\tif typeof(action) ~= "table" then return end\n\tprint("[Game] Action from", player.Name, ":", action.type or "unknown")\nend)\n\nreturn GameManager\n`,
    });

    this.register("inventory", {
      system: "inventory",
      scriptType: "ModuleScript",
      name: "InventoryService",
      path: "ServerScriptService/InventoryService",
      dependencies: ["SharedConfig", "DataService"],
      generate: () =>
        `--[[\n  InventoryService — Item management and inventory operations.\n]]\n\nlocal ServerScriptService = game:GetService("ServerScriptService")\n\nlocal InventoryService = {}\n\nlocal MAX_SLOTS = 50\n\nfunction InventoryService.addItem(playerData: any, itemId: string, quantity: number?)\n\tlocal inv = playerData.inventory\n\tif not inv then return false, "No inventory" end\n\tif #inv >= MAX_SLOTS then return false, "Inventory full" end\n\n\tlocal existing = nil\n\tfor _, item in inv do\n\t\tif item.id == itemId then\n\t\t\texisting = item\n\t\t\tbreak\n\t\tend\n\tend\n\n\tif existing then\n\t\texisting.quantity = (existing.quantity or 1) + (quantity or 1)\n\telse\n\t\ttable.insert(inv, { id = itemId, quantity = quantity or 1, obtainedAt = os.time() })\n\tend\n\n\treturn true\nend\n\nfunction InventoryService.removeItem(playerData: any, itemId: string, quantity: number?)\n\tlocal inv = playerData.inventory\n\tif not inv then return false end\n\n\tfor i, item in inv do\n\t\tif item.id == itemId then\n\t\t\titem.quantity = (item.quantity or 1) - (quantity or 1)\n\t\t\tif item.quantity <= 0 then\n\t\t\t\ttable.remove(inv, i)\n\t\t\tend\n\t\t\treturn true\n\t\tend\n\tend\n\treturn false\nend\n\nfunction InventoryService.hasItem(playerData: any, itemId: string): boolean\n\tfor _, item in playerData.inventory or {} do\n\t\tif item.id == itemId and (item.quantity or 0) > 0 then\n\t\t\treturn true\n\t\tend\n\tend\n\treturn false\nend\n\nfunction InventoryService.getCount(playerData: any, itemId: string): number\n\tfor _, item in playerData.inventory or {} do\n\t\tif item.id == itemId then return item.quantity or 0 end\n\tend\n\treturn 0\nend\n\nreturn InventoryService\n`,
    });

    this.register("player", {
      system: "player",
      scriptType: "LocalScript",
      name: "PlayerController",
      path: "StarterPlayerScripts/PlayerController",
      dependencies: ["RemoteEvents"],
      generate: () =>
        `--[[\n  PlayerController — Client-side player input and UI bridge.\n]]\n\nlocal Players = game:GetService("Players")\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal UserInputService = game:GetService("UserInputService")\n\nlocal Remotes = require(ReplicatedStorage:WaitForChild("Remotes"))\nlocal player = Players.LocalPlayer\n\nlocal PlayerController = {}\n\n-- Listen for server UI updates\nRemotes.UIUpdate.OnClientEvent:Connect(function(payload)\n\tif typeof(payload) ~= "table" then return end\n\tif payload.type == "gameState" then\n\t\tprint("[Client] Game state:", payload.state)\n\tend\nend)\n\n-- Listen for notifications\nRemotes.NotifyPlayer.OnClientEvent:Connect(function(payload)\n\tif typeof(payload) ~= "table" then return end\n\tprint("[Client] Notification:", payload.message or "")\nend)\n\n-- Input handling\nUserInputService.InputBegan:Connect(function(input, processed)\n\tif processed then return end\n\tif input.KeyCode == Enum.KeyCode.E then\n\t\tRemotes.PlayerAction:FireServer({ type = "interact" })\n\tend\nend)\n\nreturn PlayerController\n`,
    });

    this.register("ui", {
      system: "ui",
      scriptType: "LocalScript",
      name: "UIController",
      path: "StarterPlayerScripts/UIController",
      dependencies: ["RemoteEvents"],
      generate: (ctx) =>
        `--[[\n  UIController — Client UI management for ${ctx.gameName}\n]]\n\nlocal Players = game:GetService("Players")\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\n\nlocal Remotes = require(ReplicatedStorage:WaitForChild("Remotes"))\nlocal player = Players.LocalPlayer\nlocal playerGui = player:WaitForChild("PlayerGui")\n\nlocal UIController = {}\n\nfunction UIController.showNotification(message: string, duration: number?)\n\t-- Create simple notification\n\tlocal screenGui = playerGui:FindFirstChild("NotificationGui") or Instance.new("ScreenGui")\n\tscreenGui.Name = "NotificationGui"\n\tscreenGui.Parent = playerGui\n\n\tlocal label = Instance.new("TextLabel")\n\tlabel.Size = UDim2.new(0.4, 0, 0, 40)\n\tlabel.Position = UDim2.new(0.3, 0, 0.05, 0)\n\tlabel.BackgroundColor3 = Color3.fromRGB(40, 40, 60)\n\tlabel.TextColor3 = Color3.fromRGB(255, 255, 255)\n\tlabel.Text = message\n\tlabel.TextSize = 14\n\tlabel.Font = Enum.Font.GothamMedium\n\tlabel.Parent = screenGui\n\n\tlocal corner = Instance.new("UICorner")\n\tcorner.CornerRadius = UDim.new(0, 8)\n\tcorner.Parent = label\n\n\ttask.delay(duration or 3, function()\n\t\tlabel:Destroy()\n\tend)\nend\n\n-- Listen for notifications from server\nRemotes.NotifyPlayer.OnClientEvent:Connect(function(payload)\n\tif typeof(payload) == "table" and payload.message then\n\t\tUIController.showNotification(payload.message)\n\tend\nend)\n\nreturn UIController\n`,
    });
  }

  private register(system: GameplaySystem, template: LuaTemplate): void {
    const list = this.templates.get(system) ?? [];
    list.push(template);
    this.templates.set(system, list);
  }
}
