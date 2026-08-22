/**
 * LuaGenerator.genFidelity3.test.ts
 *
 * GEN-FIDELITY-3. The generic generator used to reduce every concept to the
 * same baseplate + a straight row of colored cubes, so a "medieval fortress"
 * blueprint and an unrelated one produced visually equivalent worlds with
 * different names. These fixtures prove `WorldScenePlanner` detects concept
 * intent from the blueprint and plans a recognizably different, semantically
 * grouped structure per concept — and that `LuaGenerator` materializes that
 * plan rather than a placeholder row — while GEN-FIDELITY-1/2's existing
 * behavior (the "generic" fallback category) stays intact.
 */

import { describe, expect, it } from "vitest";
import type { RobloxGameBlueprint } from "../../blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../LuaGenerator";
import { AssetGenerator } from "../../assets/AssetGenerator";
import { GameValidationEngine } from "../../validation/GameValidationEngine";
import { getPlayableLuaIssues } from "../../../types/playableLua";
import { detectConceptCategory, planWorldScene } from "../WorldScenePlanner";

function baseBlueprint(
  overrides: Partial<RobloxGameBlueprint>,
): RobloxGameBlueprint {
  return {
    id: "blueprint-fixture-3",
    title: "Untitled Game",
    genre: "adventure",
    description: "",
    coreLoop: ["discover", "engage", "reward", "repeat"],
    mechanics: ["exploration", "interaction", "progression"],
    world: {
      mapType: "open-world",
      size: "medium",
      biomes: ["forest"],
      landmarks: [],
    },
    npcs: [],
    economy: {
      currency: "coins",
      sources: ["quests"],
      sinks: ["upgrades"],
      balanceStrategy: "progressive-earning",
    },
    progression: {
      type: "milestone-based",
      stages: ["beginner", "advanced"],
      unlockMechanism: "level-thresholds",
      estimatedPlaytime: "10-50 hours",
    },
    createdAt: new Date(0),
    ...overrides,
  };
}

/** The acceptance case from GEN-FIDELITY-3's task spec. */
function fortressBlueprint(): RobloxGameBlueprint {
  return baseBlueprint({
    id: "blueprint-fortress",
    title: "Medieval Fortress Defense",
    genre: "tower-defense",
    description:
      "Create a small but complete medieval fortress surrounded by forest. " +
      "Enemies attack in three waves along a visible approach route toward " +
      "the main gate. The player defends the fortress using a sword and two " +
      "defensive systems: an archer tower and a gate repair station.",
    coreLoop: ["defend", "repair", "reward", "repeat"],
    mechanics: ["sword combat", "archer tower defense", "gate repair"],
    world: {
      mapType: "open-world",
      size: "medium",
      biomes: ["forest"],
      landmarks: ["Ancient Watchtower"],
    },
    progression: {
      type: "wave-based",
      stages: ["wave-1", "wave-2", "wave-3"],
      unlockMechanism: "wave-clear",
      estimatedPlaytime: "1-2 hours",
    },
  });
}

function obbyBlueprint(): RobloxGameBlueprint {
  return baseBlueprint({
    id: "blueprint-obby",
    title: "Sky Obby Challenge",
    genre: "platformer",
    description: "A tricky obby with checkpoints and jump mechanics.",
    mechanics: ["jump-pad", "moving-platform", "checkpoint"],
  });
}

function islandBlueprint(): RobloxGameBlueprint {
  return baseBlueprint({
    id: "blueprint-island",
    title: "Trial Island Adventure",
    genre: "adventure",
    description: "Explore a chain of island trial camps.",
    mechanics: ["fishing", "crafting", "trading"],
  });
}

function generate(bp: RobloxGameBlueprint) {
  const lua = new LuaGenerator().generate(bp);
  const scriptsByName = new Map(lua.scripts.map((s) => [s.name, s]));
  return {
    lua,
    gameManager: scriptsByName.get("GameManager")!,
    clientController: scriptsByName.get("ClientController")!,
  };
}

describe("GEN-FIDELITY-3 — concept detection", () => {
  it("detects the fortress category from blueprint text", () => {
    expect(detectConceptCategory(fortressBlueprint())).toBe("fortress");
  });

  it("detects the obby category from blueprint text", () => {
    expect(detectConceptCategory(obbyBlueprint())).toBe("obby");
  });

  it("detects the island category from blueprint text", () => {
    expect(detectConceptCategory(islandBlueprint())).toBe("island");
  });

  it("falls back to generic for an unrecognized concept", () => {
    expect(detectConceptCategory(baseBlueprint({}))).toBe("generic");
  });
});

describe("GEN-FIDELITY-3 — medieval fortress acceptance case", () => {
  const bp = fortressBlueprint();

  it("does not create objective Parts using a simple fixed index row pattern", () => {
    const { gameManager } = generate(bp);
    // The old defect: `Vector3.new(${index * 15}, 2, 30)` for every
    // objective, all sharing y=2 and z=30. The fortress plan spreads
    // objectives around the courtyard and onto named structures instead.
    expect(gameManager.code).not.toContain(
      "objectivePart1.Position = Vector3.new(0, 2, 30)",
    );
    const positions = [
      ...gameManager.code.matchAll(
        /objectivePart\d+\.Position = Vector3\.new\(([^)]+)\)/g,
      ),
    ].map((m) => m[1]);
    expect(positions).toHaveLength(bp.mechanics.length);
    // Not every objective shares the same z (the row's defining property).
    const zValues = new Set(positions.map((p) => p.split(",")[2].trim()));
    expect(zValues.size).toBeGreaterThan(1);
  });

  it("includes fortress wall construction", () => {
    const { gameManager } = generate(bp);
    expect(gameManager.code).toMatch(/"NorthWall_Wall"/);
    expect(gameManager.code).toMatch(/"EastWall_Wall"/);
    expect(gameManager.code).toMatch(/"WestWall_Wall"/);
    expect(gameManager.code).toMatch(/"SouthWallEast_Wall"/);
    expect(gameManager.code).toMatch(/"SouthWallWest_Wall"/);
  });

  it("includes a distinct gate structure", () => {
    const { gameManager } = generate(bp);
    expect(gameManager.code).toContain('"MainGate_Door"');
    expect(gameManager.code).toContain('"MainGate_Arch"');
  });

  it("includes at least two towers", () => {
    const { gameManager } = generate(bp);
    const towerNames = new Set(
      [...gameManager.code.matchAll(/"(\w+Tower)_Base"/g)].map((m) => m[1]),
    );
    expect(towerNames.size).toBeGreaterThanOrEqual(2);
  });

  it("includes an interior courtyard distinct from a biome zone", () => {
    const { gameManager } = generate(bp);
    expect(gameManager.code).toContain('"Courtyard_Floor"');
  });

  it("includes an enemy spawn and an approach route toward the gate", () => {
    const { gameManager } = generate(bp);
    expect(gameManager.code).toContain('"EnemySpawn"');
    expect(gameManager.code).toMatch(/enemy-approach-route_Waypoint\d+/);

    // The route's final waypoint lands at the gate's Z, not an arbitrary spot.
    const waypointZs = [
      ...gameManager.code.matchAll(
        /enemy-approach-route_Waypoint\d+"[\s\S]{0,200}?Position = Vector3\.new\([^,]+,[^,]+,\s*([-\d.]+)\)/g,
      ),
    ].map((m) => Number(m[1]));
    expect(waypointZs.length).toBeGreaterThanOrEqual(2);
    // Monotonically approaching the gate (increasing Z toward 0/-half).
    expect(waypointZs[waypointZs.length - 1]).toBeGreaterThan(waypointZs[0]);
  });

  it("places the archer-tower and gate-repair mechanics at their structures, not the generic row", () => {
    const scene = planWorldScene(bp);
    const archer = scene.interactables.find((i) =>
      i.linkedMechanic.includes("archer"),
    )!;
    const gateRepair = scene.interactables.find((i) =>
      i.linkedMechanic.includes("gate repair"),
    )!;
    expect(archer.linkedStructureId).toMatch(/^structure-tower-/);
    expect(gateRepair.linkedStructureId).toBe("structure-gate");
  });

  it("still includes ordered objective progression and economy integration", () => {
    const { gameManager, lua } = generate(bp);
    const economyService = lua.scripts.find(
      (s) => s.name === "EconomyService",
    )!;

    for (const mechanic of bp.mechanics) {
      expect(gameManager.code).toContain(`"${mechanic}_Interactable"`);
    }
    expect(gameManager.code).toContain("if objectiveIndex ~= progress then");
    expect(gameManager.code).toContain(
      "_G.EconomyService.Award(player.UserId, objective.reward, objective.name)",
    );
    expect(economyService.code).toContain(
      `EconomyService.CURRENCY = "${bp.economy.currency}"`,
    );
  });

  it("passes the playable-Lua contract and GameValidationEngine", () => {
    const lua = new LuaGenerator().generate(bp);
    const assets = new AssetGenerator().generate(bp);
    const issues = getPlayableLuaIssues(
      lua.scripts.map((s) => ({ path: s.path, content: s.code })),
    );
    expect(issues).toEqual([]);
    const result = new GameValidationEngine().validate(bp, lua, assets);
    expect(result.errors).toBe(0);
    expect(result.passed).toBe(true);
  });
});

describe("GEN-FIDELITY-3 — structural distinction across concepts", () => {
  it("fortress and generic blueprints produce structurally different world construction", () => {
    const fortress = generate(fortressBlueprint()).gameManager.code;
    const generic = generate(baseBlueprint({})).gameManager.code;

    expect(fortress).toContain("MainGate_Door");
    expect(generic).not.toContain("MainGate_Door");
    expect(generic).not.toMatch(/Tower_Base/);
  });

  it("fortress, obby and island blueprints each plan distinct structure types", () => {
    const fortressStructures = new Set(
      planWorldScene(fortressBlueprint()).structures.map((s) => s.type),
    );
    const obbyStructures = new Set(
      planWorldScene(obbyBlueprint()).structures.map((s) => s.type),
    );
    const islandStructures = new Set(
      planWorldScene(islandBlueprint()).structures.map((s) => s.type),
    );

    expect(fortressStructures.has("wall")).toBe(true);
    expect(fortressStructures.has("tower")).toBe(true);
    expect(fortressStructures.has("gate")).toBe(true);
    expect(obbyStructures.has("platform")).toBe(true);
    expect(obbyStructures.has("wall")).toBe(false);
    expect(islandStructures.has("camp")).toBe(true);
    expect(islandStructures.has("platform")).toBe(false);
  });
});

describe("GEN-FIDELITY-3 — determinism", () => {
  it("plans byte-identical scene output for the same blueprint", () => {
    const bp = fortressBlueprint();
    const first = planWorldScene(bp);
    const second = planWorldScene(bp);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("generates byte-identical Lua for the same blueprint across categories", () => {
    for (const bp of [
      fortressBlueprint(),
      obbyBlueprint(),
      islandBlueprint(),
    ]) {
      const first = new LuaGenerator().generate(bp);
      const second = new LuaGenerator().generate(bp);
      expect(JSON.stringify(second.scripts)).toBe(
        JSON.stringify(first.scripts),
      );
    }
  });
});

describe("GEN-FIDELITY-3 — fallback", () => {
  it("an unknown/generic blueprint still produces a valid playable world", () => {
    const bp = baseBlueprint({
      title: "Something Unclassifiable",
      description: "No recognizable concept keywords here at all.",
    });
    expect(detectConceptCategory(bp)).toBe("generic");

    const lua = new LuaGenerator().generate(bp);
    const assets = new AssetGenerator().generate(bp);
    const issues = getPlayableLuaIssues(
      lua.scripts.map((s) => ({ path: s.path, content: s.code })),
    );
    expect(issues).toEqual([]);
    const result = new GameValidationEngine().validate(bp, lua, assets);
    expect(result.passed).toBe(true);
  });
});
