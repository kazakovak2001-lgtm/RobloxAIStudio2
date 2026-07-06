/**
 * PromptDataset.ts
 *
 * Curated prompt sets for regression testing each agent type.
 * Provides standard test inputs with expected output keys.
 */

import type { TestCase } from "../regression/EvaluationSuite";

export const REQUIREMENTS_DATASET: TestCase[] = [
  {
    id: "req-01",
    agentType: "requirements",
    input: {
      blueprint: {
        name: "Mining Simulator",
        game_type: "simulator",
        genre: ["adventure"],
        difficulty: "medium",
        estimated_players: "large-group",
      },
    },
    expectedKeys: ["requirements"],
    minQuality: 60,
    description: "Extract requirements for a mining simulator",
  },
  {
    id: "req-02",
    agentType: "requirements",
    input: {
      blueprint: {
        name: "Tower Defense RPG",
        game_type: "rpg",
        genre: ["strategy", "rpg"],
        difficulty: "hard",
        estimated_players: "small-group",
      },
    },
    expectedKeys: ["requirements"],
    minQuality: 60,
    description: "Extract requirements for a tower defense RPG",
  },
];

export const GAME_DESIGNER_DATASET: TestCase[] = [
  {
    id: "gd-01",
    agentType: "game_designer",
    input: {
      blueprint: {
        name: "Pet Collector",
        game_type: "simulator",
        genre: ["casual"],
      },
      gameDesignSeed: {
        coreLoop: "collect → nurture → evolve",
        mechanics: ["collecting", "breeding", "trading"],
        theme: "fantasy garden",
        constraints: [],
        genre: "casual",
        innovationModifiers: [],
      },
    },
    expectedKeys: ["gameplay", "loop", "winCondition"],
    minQuality: 55,
    description: "Design gameplay for a pet collector",
  },
];

export const ARCHITECT_DATASET: TestCase[] = [
  {
    id: "arch-01",
    agentType: "roblox_architect",
    input: {
      blueprint: {
        name: "Battle Royale",
        game_type: "fps",
        genre: ["action"],
        estimated_players: "large-group",
      },
      gameplay: { mechanics: [{ name: "combat" }, { name: "looting" }] },
    },
    expectedKeys: ["architecture", "roblox_architect"],
    minQuality: 55,
    description: "Design architecture for a battle royale",
  },
];

export const LUA_GENERATOR_DATASET: TestCase[] = [
  {
    id: "lua-01",
    agentType: "lua_generator",
    input: {
      blueprint: { name: "Obby Runner" },
      architecture: {
        services: {
          GameManager: "Manages game state",
          PlayerService: "Manages players",
        },
      },
      gameplay: { mechanics: [{ name: "parkour" }] },
    },
    expectedKeys: ["lua_generator"],
    minQuality: 55,
    description: "Generate Lua modules for an obby game",
  },
];

export const ORCHESTRATOR_DATASET: TestCase[] = [
  {
    id: "orch-01",
    agentType: "orchestrator",
    input: {
      blueprint: {
        name: "Tycoon Game",
        description: "Build and manage your empire",
      },
      gameplay: { mechanics: [{ name: "building" }, { name: "economy" }] },
      lua_generator: { server: [{ name: "TycoonManager" }] },
    },
    expectedKeys: ["status", "world", "systems"],
    minQuality: 50,
    description: "Synthesize final world definition for tycoon game",
  },
];

/**
 * Get all test datasets combined.
 */
export function getAllDatasets(): TestCase[] {
  return [
    ...REQUIREMENTS_DATASET,
    ...GAME_DESIGNER_DATASET,
    ...ARCHITECT_DATASET,
    ...LUA_GENERATOR_DATASET,
    ...ORCHESTRATOR_DATASET,
  ];
}
