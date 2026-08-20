/**
 * LuaGenerator.genFidelity1.test.ts
 *
 * GEN-FIDELITY-1. GameManager used to consume only bp.mechanics[0] and
 * hardcode one objective at a fixed position, ignoring the rest of the
 * blueprint. These fixtures prove the deterministic generator now
 * materializes a small but coherent playable loop from the blueprint's own
 * mechanics, coreLoop, progression, economy and world data — and that the
 * result still passes every existing blocking gate
 * (GameValidationEngine / LuaCodeValidator / the playable-Lua contract).
 */

import { describe, expect, it } from "vitest";
import type { RobloxGameBlueprint } from "../../blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../LuaGenerator";
import { AssetGenerator } from "../../assets/AssetGenerator";
import { GameValidationEngine } from "../../validation/GameValidationEngine";
import { getPlayableLuaIssues } from "../../../types/playableLua";

/** >= 3 mechanics, >= 2 biomes, progression stages, an economy currency. */
function acceptanceFixture(): RobloxGameBlueprint {
  return {
    id: "blueprint-fixture-1",
    title: "Ember Reach",
    genre: "adventure",
    description: "A test blueprint",
    coreLoop: ["discover", "engage", "reward", "repeat"],
    mechanics: ["mining", "crafting", "trading", "combat"],
    world: {
      mapType: "open-world",
      size: "medium",
      biomes: ["forest", "desert", "tundra"],
      landmarks: ["Ancient Spire", "Sunken Ruins"],
    },
    npcs: [],
    economy: {
      currency: "gems",
      sources: ["quests"],
      sinks: ["upgrades"],
      balanceStrategy: "progressive-earning",
    },
    progression: {
      type: "milestone-based",
      stages: ["novice", "adept", "master"],
      unlockMechanism: "level-thresholds",
      estimatedPlaytime: "10-50 hours",
    },
    createdAt: new Date(0),
  };
}

function generate(bp: RobloxGameBlueprint) {
  const lua = new LuaGenerator().generate(bp);
  const gameManager = lua.scripts.find((s) => s.name === "GameManager")!;
  const clientController = lua.scripts.find(
    (s) => s.name === "ClientController",
  )!;
  return { lua, gameManager, clientController };
}

describe("GEN-FIDELITY-1 — blueprint-driven playable loop", () => {
  it("fixture satisfies the acceptance minimums", () => {
    const bp = acceptanceFixture();
    expect(bp.mechanics.length).toBeGreaterThanOrEqual(3);
    expect(bp.world.biomes.length).toBeGreaterThanOrEqual(2);
    expect(bp.progression.stages.length).toBeGreaterThan(0);
    expect(bp.economy.currency.length).toBeGreaterThan(0);
  });

  it("materializes a spawnable world", () => {
    const { gameManager } = generate(acceptanceFixture());
    expect(gameManager.code).toMatch(
      /Instance\.new\("SpawnLocation"\)[\s\S]*spawnPoint\.Name = "MainSpawn"/,
    );
    expect(gameManager.code).toContain("spawnPoint.Parent = workspace");
  });

  it("materializes one distinct, positioned objective per blueprint mechanic", () => {
    const bp = acceptanceFixture();
    const { gameManager } = generate(bp);

    for (const mechanic of bp.mechanics) {
      expect(gameManager.code).toContain(`"${mechanic}_Interactable"`);
    }

    // Distinctly positioned — not the single hardcoded (15, 2, 15) objective
    // the old generator produced regardless of mechanic count.
    const positions = [
      ...gameManager.code.matchAll(
        /objectivePart\d+\.Position = (Vector3\.new\([^)]+\))/g,
      ),
    ].map((m) => m[1]);
    expect(positions).toHaveLength(bp.mechanics.length);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("tracks an ordered, progress-gated gameplay loop through coreLoop/progression", () => {
    const bp = acceptanceFixture();
    const { gameManager } = generate(bp);

    // Objectives carry the coreLoop stage they represent, and reward from
    // the blueprint's economy — not a placeholder constant.
    for (const [index, mechanic] of bp.mechanics.entries()) {
      const loopStage = bp.coreLoop[index % bp.coreLoop.length];
      expect(gameManager.code).toContain(
        `{ name = "${mechanic}", loopStage = "${loopStage}"`,
      );
    }

    // Server-side ordering gate: an objective only advances progress when
    // its index matches the player's current position.
    expect(gameManager.code).toContain("if objectiveIndex ~= progress then");
    expect(gameManager.code).toContain(
      "playerProgress[player.UserId] = progress + 1",
    );

    // Progression stages drive the reported stage, not a hardcoded string.
    expect(gameManager.code).toContain(
      `local PROGRESSION_STAGES = {${bp.progression.stages
        .map((s) => `"${s}"`)
        .join(", ")}}`,
    );
    expect(gameManager.code).toContain("stageForProgress(progress)");
  });

  it("pays server-authoritative rewards in the blueprint's economy currency", () => {
    const { gameManager } = generate(acceptanceFixture());

    // Reward is decided and applied entirely server-side from data baked
    // into OBJECTIVES at generation time — no client-supplied amount.
    expect(gameManager.code).toContain(
      "playerCoins[player.UserId] = (playerCoins[player.UserId] or 0) + objective.reward",
    );
    expect(gameManager.code).toContain(
      "_G.EconomyService.Award(player.UserId, objective.reward, objective.name)",
    );
    // EconomyService.CURRENCY is the blueprint's currency (asserted below via
    // the EconomyService script), and GameManager pays through that service
    // rather than duplicating a second currency concept.
  });

  it("EconomyService carries the blueprint's currency and is wired to GameManager", () => {
    const bp = acceptanceFixture();
    const { lua, gameManager } = generate(bp);
    const economyService = lua.scripts.find(
      (s) => s.name === "EconomyService",
    )!;

    expect(economyService.code).toContain(
      `EconomyService.CURRENCY = "${bp.economy.currency}"`,
    );
    expect(economyService.code).toContain("_G.EconomyService = EconomyService");
    expect(gameManager.code).toContain("_G.EconomyService.Award(");
  });

  it("HUD reports objective, progress, next step, stage and reward", () => {
    const { clientController } = generate(acceptanceFixture());

    expect(clientController.code).toContain("data.completed");
    expect(clientController.code).toContain("data.completedCount");
    expect(clientController.code).toContain("data.totalObjectives");
    expect(clientController.code).toContain("data.nextObjective");
    expect(clientController.code).toContain("data.stage");
    expect(clientController.code).toContain("data.coins");
    // Reused server -> client event boundary, not a new one.
    expect(clientController.code).toContain(
      'local progressEvent = ReplicatedStorage:WaitForChild("ProgressUpdated")',
    );
  });

  it("produces visible world differentiation from blueprint biomes and landmarks", () => {
    const bp = acceptanceFixture();
    const { gameManager } = generate(bp);

    for (const biome of bp.world.biomes) {
      expect(gameManager.code).toContain(`"${biome}_Zone"`);
    }
    for (const landmark of bp.world.landmarks) {
      expect(gameManager.code).toContain(`"${landmark}_Landmark"`);
    }
    // Biome zones are distinctly coloured, not identical parts.
    const colors = [
      ...gameManager.code.matchAll(
        /biomeZone\d+\.Color = (Color3\.fromRGB\([^)]+\))/g,
      ),
    ].map((m) => m[1]);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("omits the landmark section entirely when the blueprint names none", () => {
    const bp = {
      ...acceptanceFixture(),
      world: { ...acceptanceFixture().world, landmarks: [] },
    };
    const { gameManager } = generate(bp);
    expect(gameManager.code).not.toContain("_Landmark");
  });

  it("keeps exactly one authoritative server GameManager and one client HUD", () => {
    const { lua } = generate(acceptanceFixture());
    const serverScripts = lua.scripts.filter((s) => s.type === "server");
    const gameManagers = serverScripts.filter((s) => s.name === "GameManager");
    expect(gameManagers).toHaveLength(1);
    expect(
      lua.scripts.filter((s) => s.name === "ClientController"),
    ).toHaveLength(1);
  });

  it("passes the existing playable-Lua contract unchanged", () => {
    const bp = acceptanceFixture();
    const { lua } = generate(bp);
    const issues = getPlayableLuaIssues(
      lua.scripts.map((s) => ({ path: s.path, content: s.code })),
    );
    expect(issues).toEqual([]);
  });

  it("passes GameValidationEngine (LuaCodeValidator + security + playability gates)", () => {
    const bp = acceptanceFixture();
    const lua = new LuaGenerator().generate(bp);
    const assets = new AssetGenerator().generate(bp);
    const result = new GameValidationEngine().validate(bp, lua, assets);

    expect(result.errors).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("stays deterministic: same blueprint produces byte-identical output", () => {
    const bp = acceptanceFixture();
    const first = new LuaGenerator().generate(bp);
    const second = new LuaGenerator().generate(bp);
    expect(JSON.stringify(second.scripts)).toBe(JSON.stringify(first.scripts));
  });

  it("still degrades gracefully for the minimal default blueprint", () => {
    // The unmodified default path (no planner output) — must not regress.
    const bp: RobloxGameBlueprint = {
      id: "blueprint-default",
      title: "Untitled Game",
      genre: "adventure",
      description: "",
      coreLoop: ["discover", "engage", "reward", "repeat"],
      mechanics: ["exploration", "interaction", "progression"],
      world: {
        mapType: "open-world",
        size: "medium",
        biomes: ["spawn", "main-area"],
        landmarks: [],
      },
      npcs: [],
      economy: {
        currency: "coins",
        sources: ["quests", "exploration", "combat"],
        sinks: ["upgrades", "cosmetics", "unlocks"],
        balanceStrategy: "progressive-earning with soft caps",
      },
      progression: {
        type: "milestone-based",
        stages: ["beginner", "intermediate", "advanced", "mastery"],
        unlockMechanism: "level-thresholds",
        estimatedPlaytime: "10-50 hours",
      },
      createdAt: new Date(0),
    };
    const lua = new LuaGenerator().generate(bp);
    const assets = new AssetGenerator().generate(bp);
    const result = new GameValidationEngine().validate(bp, lua, assets);
    expect(result.passed).toBe(true);
  });
});
