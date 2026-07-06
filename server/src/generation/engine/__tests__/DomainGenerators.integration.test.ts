/**
 * Domain Generators Integration Tests (v2.3 extension)
 *
 * Tests: GameStructureGenerator, GameplayGenerator, EnvironmentGenerator
 * + their validators + pipeline integration
 */

import { describe, it, expect } from "vitest";
import { GenerationEngine } from "../GenerationEngine";
import { GeneratorRegistry } from "../GeneratorRegistry";
import { GameStructureGenerator } from "../generators/GameStructureGenerator";
import {
  GameplayGenerator,
  type GameplayManifest,
} from "../generators/GameplayGenerator";
import {
  EnvironmentGenerator,
  type EnvironmentManifest,
} from "../generators/EnvironmentGenerator";
import { GameStructureValidator } from "../validators/GameStructureValidator";
import { GameplayValidator } from "../validators/GameplayValidator";
import { EnvironmentValidator } from "../validators/EnvironmentValidator";
import { createEmptyModel } from "../GenerationModel";

function createDomainRegistry(): GeneratorRegistry {
  const registry = new GeneratorRegistry();
  registry.register(new GameStructureGenerator());
  registry.register(new GameplayGenerator());
  registry.register(new EnvironmentGenerator());
  return registry;
}

describe("GameStructureGenerator", () => {
  it("generates folders, services, and dependencies for obby", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Obby World",
      genre: "obby",
      game_type: "obby",
      mechanics: ["jumping", "climbing"],
    });

    expect(result.success).toBe(true);
    expect(result.model.folders.length).toBeGreaterThan(10);
    expect(result.model.services.length).toBeGreaterThan(4);
    expect(result.model.dependencies.length).toBeGreaterThan(0);
    // Obby-specific folders
    expect(result.model.folders.some((f) => f.path.includes("Stages"))).toBe(
      true,
    );
    expect(
      result.model.folders.some((f) => f.path.includes("Checkpoints")),
    ).toBe(true);
  });

  it("generates RPG-specific structure", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Epic RPG",
      genre: "rpg",
      game_type: "rpg",
      mechanics: ["combat", "collect"],
    });

    expect(
      result.model.services.some((s) => s.name === "InventoryService"),
    ).toBe(true);
    expect(result.model.services.some((s) => s.name === "QuestManager")).toBe(
      true,
    );
    expect(result.model.folders.some((f) => f.path.includes("NPCs"))).toBe(
      true,
    );
  });
});

describe("GameplayGenerator", () => {
  it("generates mechanics, systems, progression, objectives, events", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Action Game",
      genre: "adventure",
      mechanics: ["combat", "collect", "jump"],
    });

    expect(result.success).toBe(true);
    // Gameplay manifest is stored in context
    const ctx = result.context;
    const manifest = ctx.generatorResults["gameplay-generator"];
    expect(manifest.success).toBe(true);
    // Networking events generated
    expect(result.model.networking.remoteEvents.length).toBeGreaterThan(0);
  });

  it("classifies mechanics correctly", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Test",
      genre: "test",
      mechanics: ["jumping", "fighting", "collecting", "puzzle-solving"],
    });

    expect(result.success).toBe(true);
    expect(result.model.networking.remoteEvents.length).toBeGreaterThan(2);
  });
});

describe("EnvironmentGenerator", () => {
  it("generates maps, zones, spawn points for obby", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Mega Obby",
      genre: "obby",
      game_type: "obby",
      mechanics: ["jump"],
    });

    expect(result.success).toBe(true);
    expect(result.model.assets.length).toBeGreaterThan(0);
    // Obby should have stages
    expect(result.model.assets.some((a) => a.name.includes("Stage"))).toBe(
      true,
    );
  });

  it("generates lobby for all game types", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Any Game",
      genre: "shooter",
      mechanics: [],
    });

    expect(result.model.assets.some((a) => a.name === "Lobby")).toBe(true);
  });
});

describe("GameStructureValidator", () => {
  const validator = new GameStructureValidator();

  it("passes a valid model", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Valid Game",
      genre: "obby",
      game_type: "obby",
      mechanics: ["jump"],
    });
    const validation = validator.validate(result.model);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("fails on missing services", () => {
    const model = createEmptyModel({
      title: "Bad",
      genre: "test",
      description: "",
      targetAudience: "all",
      mechanics: [],
      maxPlayers: 4,
    });
    model.services = []; // no services
    const validation = validator.validate(model);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("detects duplicate folders", () => {
    const model = createEmptyModel({
      title: "Dup",
      genre: "test",
      description: "",
      targetAudience: "all",
      mechanics: [],
      maxPlayers: 4,
    });
    model.services = [
      {
        name: "DataStoreService",
        type: "server",
        description: "",
        dependencies: [],
      },
      {
        name: "GameStateManager",
        type: "server",
        description: "",
        dependencies: [],
      },
      {
        name: "PlayerManager",
        type: "server",
        description: "",
        dependencies: [],
      },
      {
        name: "NetworkManager",
        type: "shared",
        description: "",
        dependencies: [],
      },
    ];
    model.folders = [
      { path: "ServerScriptService", parent: "game", purpose: "a" },
      { path: "ServerScriptService", parent: "game", purpose: "b" },
      { path: "ReplicatedStorage", parent: "game", purpose: "c" },
      { path: "StarterPlayerScripts", parent: "game", purpose: "d" },
      { path: "Workspace", parent: "game", purpose: "e" },
    ];
    const validation = validator.validate(model);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });
});

describe("GameplayValidator", () => {
  const validator = new GameplayValidator();

  it("passes valid manifest", () => {
    const manifest: GameplayManifest = {
      mechanics: [
        {
          id: "m1",
          name: "jump",
          type: "movement",
          description: "jump",
          requiredServices: [],
        },
      ],
      playerSystems: [
        {
          id: "ps1",
          name: "Input",
          scope: "client",
          responsibilities: ["input"],
        },
      ],
      progression: {
        type: "linear",
        stages: 5,
        unlockMechanism: "reach-end",
        rewards: ["badge"],
      },
      objectives: [
        {
          id: "o1",
          name: "Win",
          type: "main",
          description: "win",
          completionCriteria: "done",
        },
      ],
      events: [],
    };
    expect(validator.validate(manifest).valid).toBe(true);
  });

  it("fails on missing manifest", () => {
    expect(validator.validate(undefined).valid).toBe(false);
  });

  it("fails on empty mechanics", () => {
    const manifest: GameplayManifest = {
      mechanics: [],
      playerSystems: [
        { id: "ps1", name: "X", scope: "client", responsibilities: [] },
      ],
      progression: {
        type: "linear",
        stages: 1,
        unlockMechanism: "x",
        rewards: [],
      },
      objectives: [],
      events: [],
    };
    expect(validator.validate(manifest).valid).toBe(false);
  });
});

describe("EnvironmentValidator", () => {
  const validator = new EnvironmentValidator();

  it("passes valid manifest", () => {
    const manifest: EnvironmentManifest = {
      maps: [
        {
          id: "m1",
          name: "Lobby",
          type: "lobby",
          size: { x: 100, y: 50, z: 100 },
          theme: "modern",
          zones: [],
        },
      ],
      zones: [
        {
          id: "z1",
          name: "Safe",
          mapId: "m1",
          type: "safe",
          bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 },
          properties: {},
        },
      ],
      spawnPoints: [
        {
          id: "s1",
          name: "Start",
          position: { x: 0, y: 5, z: 0 },
          type: "initial",
          mapId: "m1",
        },
      ],
      environmentObjects: [],
    };
    expect(validator.validate(manifest).valid).toBe(true);
  });

  it("fails on missing manifest", () => {
    expect(validator.validate(undefined).valid).toBe(false);
  });

  it("fails on missing initial spawn", () => {
    const manifest: EnvironmentManifest = {
      maps: [
        {
          id: "m1",
          name: "X",
          type: "main",
          size: { x: 10, y: 10, z: 10 },
          theme: "x",
          zones: [],
        },
      ],
      zones: [],
      spawnPoints: [],
      environmentObjects: [],
    };
    expect(validator.validate(manifest).valid).toBe(false);
  });

  it("fails on invalid map reference", () => {
    const manifest: EnvironmentManifest = {
      maps: [
        {
          id: "m1",
          name: "X",
          type: "main",
          size: { x: 10, y: 10, z: 10 },
          theme: "x",
          zones: [],
        },
      ],
      zones: [
        {
          id: "z1",
          name: "Bad",
          mapId: "nonexistent",
          type: "safe",
          bounds: { minX: 0, minZ: 0, maxX: 1, maxZ: 1 },
          properties: {},
        },
      ],
      spawnPoints: [
        {
          id: "s1",
          name: "Start",
          position: { x: 0, y: 5, z: 0 },
          type: "initial",
          mapId: "m1",
        },
      ],
      environmentObjects: [],
    };
    expect(validator.validate(manifest).valid).toBe(false);
  });
});

describe("Full Domain Pipeline", () => {
  it("runs all 3 domain generators in dependency order", async () => {
    const registry = createDomainRegistry();
    const engine = new GenerationEngine(registry);
    const result = await engine.generate({
      name: "Full Game",
      genre: "obby",
      game_type: "obby",
      mechanics: ["jumping", "sliding", "collecting"],
    });

    expect(result.success).toBe(true);
    expect(
      result.context.generatorResults["game-structure-generator"].success,
    ).toBe(true);
    expect(result.context.generatorResults["gameplay-generator"].success).toBe(
      true,
    );
    expect(
      result.context.generatorResults["environment-generator"].success,
    ).toBe(true);
    expect(result.model.folders.length).toBeGreaterThan(10);
    expect(result.model.assets.length).toBeGreaterThan(0);
  });
});
