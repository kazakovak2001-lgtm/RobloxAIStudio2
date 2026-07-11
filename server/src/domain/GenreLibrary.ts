/**
 * GenreLibrary — Complete Roblox game genre blueprints.
 */

import type { GameGenre, GenreBlueprint } from "./DomainTypes";

const GENRES: GenreBlueprint[] = [
  {
    genre: "obby",
    name: "Obby",
    description: "Obstacle course with checkpoints and stages",
    gameplayLoop:
      "Attempt stage → Fail/Complete → Progress → Unlock harder stages",
    requiredSystems: ["checkpoints", "stage_progression", "leaderboards"],
    optionalSystems: ["timer", "collectibles", "shop", "trails"],
    coreMechanics: ["jumping", "timing", "precision", "difficulty_scaling"],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "StarterPlayer",
    ],
    commonAssets: ["platforms", "killbricks", "effects", "checkpointFlags"],
    expectedUI: ["StageCounter", "Timer", "Leaderboard", "Shop"],
    complexity: 30,
    estimatedScripts: 5,
  },
  {
    genre: "simulator",
    name: "Simulator",
    description: "Click/action based progression with rebirths",
    gameplayLoop:
      "Perform action → Gain currency → Buy upgrades → Rebirth → Repeat faster",
    requiredSystems: ["currency", "upgrades", "rebirth", "collection", "pets"],
    optionalSystems: ["trading", "guilds", "events", "vip"],
    coreMechanics: ["clicking", "auto_collect", "multipliers", "prestige"],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "ServerStorage",
    ],
    commonAssets: ["tools", "pets", "zones", "effects", "eggs"],
    expectedUI: [
      "CurrencyDisplay",
      "UpgradeShop",
      "PetInventory",
      "RebirthPanel",
    ],
    complexity: 60,
    estimatedScripts: 12,
  },
  {
    genre: "tycoon",
    name: "Tycoon",
    description: "Build and manage a business/factory",
    gameplayLoop:
      "Earn money → Purchase buildings → Automate → Expand → Prestige",
    requiredSystems: ["currency", "building", "automation", "droppers"],
    optionalSystems: ["pvp", "trading", "prestige", "research"],
    coreMechanics: ["placement", "resource_flow", "upgrades", "optimization"],
    recommendedServices: ["ServerScriptService", "ServerStorage", "Workspace"],
    commonAssets: ["buildings", "conveyors", "droppers", "buttons", "effects"],
    expectedUI: ["MoneyDisplay", "ShopMenu", "BuildingInfo", "PrestigePanel"],
    complexity: 55,
    estimatedScripts: 10,
  },
  {
    genre: "rpg",
    name: "RPG",
    description: "Story-driven adventure with character progression",
    gameplayLoop: "Explore → Fight → Loot → Level Up → Unlock areas → Repeat",
    requiredSystems: [
      "combat",
      "inventory",
      "quests",
      "npc",
      "progression",
      "datastore",
    ],
    optionalSystems: ["crafting", "guilds", "dungeons", "mounts", "housing"],
    coreMechanics: [
      "combat",
      "leveling",
      "equipment",
      "exploration",
      "dialogue",
    ],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "ServerStorage",
      "StarterPlayer",
    ],
    commonAssets: [
      "weapons",
      "armor",
      "npcs",
      "environments",
      "effects",
      "ui_frames",
    ],
    expectedUI: [
      "Inventory",
      "QuestLog",
      "CharacterSheet",
      "DialogueBox",
      "Minimap",
      "HUD",
    ],
    complexity: 85,
    estimatedScripts: 18,
  },
  {
    genre: "fps",
    name: "FPS",
    description: "First-person shooter with competitive gameplay",
    gameplayLoop: "Queue → Spawn → Eliminate → Earn → Upgrade loadout → Repeat",
    requiredSystems: ["weapons", "health", "respawn", "teams", "matchmaking"],
    optionalSystems: ["loadouts", "ranking", "killstreaks", "vehicles"],
    coreMechanics: [
      "aiming",
      "movement",
      "recoil",
      "hit_detection",
      "respawning",
    ],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "StarterPlayer",
    ],
    commonAssets: ["weapons", "maps", "crosshair", "killFeed", "effects"],
    expectedUI: ["HUD", "Killfeed", "Scoreboard", "LoadoutSelect", "Minimap"],
    complexity: 75,
    estimatedScripts: 14,
  },
  {
    genre: "tower_defense",
    name: "Tower Defense",
    description: "Strategic tower placement against waves",
    gameplayLoop:
      "Place towers → Start wave → Enemies approach → Towers attack → Earn currency → Upgrade",
    requiredSystems: ["towers", "waves", "pathfinding", "currency", "upgrades"],
    optionalSystems: ["coop", "boss_waves", "tower_merging", "research"],
    coreMechanics: ["placement", "targeting", "wave_management", "economy"],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "Workspace",
    ],
    commonAssets: ["towers", "enemies", "maps", "projectiles", "effects"],
    expectedUI: ["TowerShop", "WaveCounter", "CurrencyDisplay", "TowerInfo"],
    complexity: 70,
    estimatedScripts: 13,
  },
  {
    genre: "survival",
    name: "Survival",
    description: "Gather, craft, build, survive",
    gameplayLoop: "Gather → Craft → Build → Defend → Explore → Repeat",
    requiredSystems: [
      "inventory",
      "crafting",
      "building",
      "health",
      "hunger",
      "enemies",
    ],
    optionalSystems: ["vehicles", "electricity", "farming", "trading"],
    coreMechanics: [
      "gathering",
      "crafting",
      "building",
      "combat",
      "exploration",
    ],
    recommendedServices: [
      "ServerScriptService",
      "ServerStorage",
      "ReplicatedStorage",
      "Workspace",
    ],
    commonAssets: [
      "resources",
      "tools",
      "structures",
      "enemies",
      "environment",
    ],
    expectedUI: [
      "Inventory",
      "CraftingMenu",
      "HealthBar",
      "Hotbar",
      "BuildMenu",
    ],
    complexity: 80,
    estimatedScripts: 16,
  },
  {
    genre: "horror",
    name: "Horror",
    description: "Atmospheric horror with puzzles and chase",
    gameplayLoop:
      "Enter area → Investigate → Encounter threat → Escape/Solve → Progress",
    requiredSystems: ["atmosphere", "puzzles", "chase", "story", "lighting"],
    optionalSystems: ["multiplayer_coop", "randomization", "items", "endings"],
    coreMechanics: [
      "exploration",
      "puzzle_solving",
      "stealth",
      "chase_sequences",
    ],
    recommendedServices: [
      "ServerScriptService",
      "Lighting",
      "SoundService",
      "StarterPlayer",
    ],
    commonAssets: ["environments", "sounds", "lighting", "props", "monsters"],
    expectedUI: ["Dialogue", "Inventory", "Flashlight", "Objectives"],
    complexity: 50,
    estimatedScripts: 9,
  },
  {
    genre: "adventure",
    name: "Adventure",
    description: "Exploration with quests and discovery",
    gameplayLoop:
      "Explore → Discover → Solve puzzle → Progress story → Unlock area",
    requiredSystems: [
      "exploration",
      "quests",
      "collectibles",
      "npcs",
      "progression",
    ],
    optionalSystems: ["combat", "vehicles", "pets", "housing"],
    coreMechanics: ["exploration", "puzzle_solving", "story", "collection"],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "Workspace",
    ],
    commonAssets: ["environments", "npcs", "collectibles", "effects", "music"],
    expectedUI: ["QuestLog", "Map", "Inventory", "DialogueBox"],
    complexity: 55,
    estimatedScripts: 11,
  },
  {
    genre: "idle",
    name: "Idle/Clicker",
    description: "Automated progression with prestige",
    gameplayLoop:
      "Click → Earn → Buy auto-clickers → Prestige → Repeat with multipliers",
    requiredSystems: [
      "currency",
      "auto_generation",
      "upgrades",
      "prestige",
      "offline_progress",
    ],
    optionalSystems: ["achievements", "events", "leaderboards"],
    coreMechanics: ["clicking", "automation", "exponential_growth", "prestige"],
    recommendedServices: ["ServerScriptService", "ReplicatedStorage"],
    commonAssets: ["buttons", "effects", "numbers", "backgrounds"],
    expectedUI: ["MainClicker", "UpgradeShop", "PrestigePanel", "Stats"],
    complexity: 35,
    estimatedScripts: 7,
  },
  {
    genre: "pet_simulator",
    name: "Pet Simulator",
    description: "Collect, upgrade, and trade pets",
    gameplayLoop:
      "Earn coins → Open eggs → Collect pets → Upgrade → Trade → Rebirth",
    requiredSystems: [
      "pets",
      "eggs",
      "currency",
      "trading",
      "rebirth",
      "collection",
    ],
    optionalSystems: ["enchanting", "fusing", "events", "leaderboards"],
    coreMechanics: [
      "hatching",
      "collection",
      "trading",
      "upgrading",
      "exploration",
    ],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "ServerStorage",
    ],
    commonAssets: ["pets", "eggs", "zones", "effects", "ui_frames"],
    expectedUI: ["PetInventory", "EggHatcher", "TradeUI", "Collection", "Shop"],
    complexity: 65,
    estimatedScripts: 13,
  },
  {
    genre: "battle_arena",
    name: "Battle Arena",
    description: "PvP combat arena with abilities",
    gameplayLoop:
      "Queue → Select character → Fight → Win/Lose → Earn rewards → Unlock",
    requiredSystems: [
      "combat",
      "abilities",
      "matchmaking",
      "characters",
      "health",
    ],
    optionalSystems: ["ranking", "skins", "seasons", "tournaments"],
    coreMechanics: [
      "combat",
      "abilities",
      "dodging",
      "teamwork",
      "positioning",
    ],
    recommendedServices: [
      "ServerScriptService",
      "ReplicatedStorage",
      "StarterPlayer",
    ],
    commonAssets: ["characters", "abilities", "arenas", "effects", "ui_frames"],
    expectedUI: [
      "CharacterSelect",
      "AbilityBar",
      "HealthBars",
      "Scoreboard",
      "MatchUI",
    ],
    complexity: 75,
    estimatedScripts: 15,
  },
];

export class GenreLibrary {
  private genres: Map<GameGenre, GenreBlueprint> = new Map();

  constructor() {
    for (const g of GENRES) this.genres.set(g.genre, g);
  }

  get(genre: GameGenre): GenreBlueprint | null {
    return this.genres.get(genre) ?? null;
  }

  getAll(): GenreBlueprint[] {
    return [...this.genres.values()];
  }

  getByComplexity(max: number): GenreBlueprint[] {
    return this.getAll().filter((g) => g.complexity <= max);
  }

  recommend(genre: GameGenre): { required: string[]; optional: string[] } {
    const bp = this.genres.get(genre);
    if (!bp) return { required: [], optional: [] };
    return { required: bp.requiredSystems, optional: bp.optionalSystems };
  }
}
