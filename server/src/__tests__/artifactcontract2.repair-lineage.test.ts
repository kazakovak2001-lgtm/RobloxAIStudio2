import { describe, expect, it, vi } from "vitest";

import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import {
  ArtifactStore,
  agentProducer,
  deterministicProducer,
  type PipelineArtifact,
} from "../pipeline/v2";
import { RepairEngine } from "../repair/RepairEngine";
import { InMemoryRepairSessionStore } from "../repair/RepairSessionStore";
import { buildWorldModel } from "../validation/worldModel";
import {
  buildGameDnaFromStoredWorld,
  buildGameDnaReport,
} from "../validation/gameDna";

/**
 * ARTIFACT-CONTRACT-2 — repair lineage.
 *
 * The defect this closes: a repaired execution used to carry the parent's
 * SECURITY_REVIEW and VALIDATION forward unchanged, so new Lua sat beside a
 * report of the old Lua and the pair read as one coherent package.
 */

const PROJECT_ID = "repair-lineage-project";
const PARENT_EXECUTION_ID = "repair-lineage-parent";

/** One design, shared, so every generation below fingerprints identically. */
const REPAIR_SOURCES = {
  gameDesign: {
    gameplay: {
      mechanics: [{ name: "collect" }],
      balance: { winCondition: "Collect them all" },
    },
  },
  architecture: {
    architecture: { services: { SpawnService: "spawns" } },
  },
};

const BROKEN_SCRIPTS = [
  {
    path: "ServerScriptService/World.server.lua",
    content:
      "local world = workspace:FindFirstChild('World') or Instance.new('Folder')\nworld.Name = 'World'\nworld.Parent = workspace",
  },
  {
    path: "StarterPlayerScripts/HUD.client.lua",
    content:
      "local Players = game:GetService('Players')\nlocal gui = Instance.new('ScreenGui')\ngui.Parent = Players.LocalPlayer:WaitForChild('PlayerGui')",
  },
];

async function seedBlueprint(
  repository: InMemoryBlueprintRepository,
): Promise<void> {
  await repository.createBlueprint("repair-lineage-user", {
    project_id: PROJECT_ID,
    user_id: "repair-lineage-user",
    name: "Repair Lineage Game",
    description: "A blueprint used only to exercise repair lineage.",
    game_type: "rpg",
    genre: ["rpg"],
    target_audience: "all ages",
    difficulty: "medium",
    estimated_players: "small-group",
    gameplay: { mechanics: [], progression: {}, balance: {} },
    ui_layouts: [],
    architecture: {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    },
    assets: { models: [], textures: [], sounds: [], animations: [] },
    code_spec: { modules: [], patterns: [] },
  });
}

/** Run one repair and return the parent and repaired artifact sets. */
async function runRepair(): Promise<{
  store: ArtifactStore;
  parent: PipelineArtifact[];
  repaired: PipelineArtifact[];
  staleReview: PipelineArtifact;
}> {
  const registry = new AgentRegistry();
  const luaAgent = registry.getAgent("lua_generator");
  if (!luaAgent) throw new Error("lua_generator agent missing");

  const playable = await luaAgent.execute({
    blueprint: { name: "Repair Lineage Game", description: "baseline" },
    architecture: {},
    gameplay: {},
  });
  luaAgent.setLLM({
    generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
  });

  const repository = new InMemoryBlueprintRepository();
  await seedBlueprint(repository);

  const store = new ArtifactStore();
  const parentLua = await store.store(
    PARENT_EXECUTION_ID,
    "LUA_GENERATION",
    "lua_generator",
    { scripts: BROKEN_SCRIPTS },
    { projectId: PROJECT_ID },
  );
  await store.store(
    PARENT_EXECUTION_ID,
    "ARCHITECTURE",
    "roblox_architect",
    { services: ["WorldService"] },
    { projectId: PROJECT_ID },
  );
  // The parent's review, bound to the parent's Lua.
  const staleReview = await store.store(
    PARENT_EXECUTION_ID,
    "SECURITY_REVIEW",
    null,
    { findings: [], reviewedScriptCount: BROKEN_SCRIPTS.length },
    {
      projectId: PROJECT_ID,
      producer: deterministicProducer("lua-security-review"),
      dependencies: [ArtifactStore.dependencyOn(parentLua)],
    },
  );

  const engine = new RepairEngine(
    registry,
    repository,
    store,
    new InMemoryRepairSessionStore(),
  );
  const session = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
    maxIterations: 1,
    targetScore: 95,
  });
  const newExecutionId = session.history[0]?.newExecutionId;
  if (!newExecutionId) throw new Error("Repair produced no new execution");

  return {
    store,
    parent: store.getByPipeline(PARENT_EXECUTION_ID),
    repaired: store.getByPipeline(newExecutionId),
    staleReview,
  };
}

describe("ARTIFACT-CONTRACT-2 repair lineage", () => {
  it("gives the repaired package new identity and leaves the original intact", async () => {
    const { parent, repaired, staleReview } = await runRepair();

    const parentLua = parent.find((a) => a.stage === "LUA_GENERATION")!;
    const repairedLua = repaired.find((a) => a.stage === "LUA_GENERATION")!;

    expect(repairedLua.id).not.toBe(parentLua.id);
    expect(repairedLua.contentHash).not.toBe(parentLua.contentHash);
    // The original is untouched: same id, same hash, same review bound to it.
    expect(parentLua.contentHash).toBe(
      staleReview.dependencies?.[0].contentHash,
    );
    expect(parent.map((a) => a.stage).sort()).toEqual([
      "ARCHITECTURE",
      "LUA_GENERATION",
      "SECURITY_REVIEW",
    ]);
  }, 20000);

  it("records the repaired Lua as derived from the Lua it replaces", async () => {
    const { parent, repaired } = await runRepair();

    const parentLua = parent.find((a) => a.stage === "LUA_GENERATION")!;
    const repairedLua = repaired.find((a) => a.stage === "LUA_GENERATION")!;

    expect(repairedLua.dependencies).toEqual([
      {
        artifactId: parentLua.id,
        stage: "LUA_GENERATION",
        contentHash: parentLua.contentHash,
      },
    ]);
  }, 20000);

  it("never carries a security review of the old Lua onto the new one", async () => {
    const { repaired, staleReview } = await runRepair();

    const repairedLua = repaired.find((a) => a.stage === "LUA_GENERATION")!;
    const repairedReview = repaired.find((a) => a.stage === "SECURITY_REVIEW")!;

    expect(repairedReview).toBeDefined();
    // A fresh review, bound to the new Lua — not the parent's report moved over.
    expect(repairedReview.id).not.toBe(staleReview.id);
    expect(repairedReview.dependencies).toEqual([
      {
        artifactId: repairedLua.id,
        stage: "LUA_GENERATION",
        contentHash: repairedLua.contentHash,
      },
    ]);
    expect(repairedReview.contentHash).not.toBe(staleReview.contentHash);
  }, 20000);

  it("attributes carried-forward stages to the repair, not to a rerun agent", async () => {
    const { repaired } = await runRepair();

    const architecture = repaired.find((a) => a.stage === "ARCHITECTURE")!;

    // `roblox_architect` did not run during this repair, so claiming it as the
    // producer of this copy would say a model authored it here.
    expect(architecture.producer).toEqual({
      type: "deterministic",
      id: "repair-carry-forward",
      version: 1,
    });
    expect(
      repaired.find((a) => a.stage === "LUA_GENERATION")!.producer,
    ).toEqual(agentProducer("lua_generator"));
  }, 20000);

  it("does not emit a validation report it did not compute", async () => {
    const { repaired } = await runRepair();

    // The generation-time report needs UI materialization and world
    // cross-validation, neither of which a repair re-runs. Absence is
    // truthful; a copied or partial report would not be.
    expect(repaired.some((a) => a.stage === "VALIDATION")).toBe(false);
  }, 20000);
});

describe("NOVELTY-1 repair rebuilds the structural fingerprint", () => {
  async function runRepairWithWorld() {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Lineage Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });

    const repository = new InMemoryBlueprintRepository();
    await seedBlueprint(repository);

    const store = new ArtifactStore();
    await store.store(
      PARENT_EXECUTION_ID,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: BROKEN_SCRIPTS },
      { projectId: PROJECT_ID },
    );
    const parentWorld = await store.store(
      PARENT_EXECUTION_ID,
      "WORLD_MODEL",
      null,
      buildWorldModel(REPAIR_SOURCES),
      { projectId: PROJECT_ID, producer: deterministicProducer("world-model") },
    );
    // The parent's own fingerprint, which correctly says it had no history.
    await store.store(
      PARENT_EXECUTION_ID,
      "GAME_DNA",
      null,
      buildGameDnaReport({
        dna: buildGameDnaFromStoredWorld(parentWorld.content)!,
        priorsFound: 0,
        priors: [],
      }),
      {
        projectId: PROJECT_ID,
        producer: deterministicProducer("game-dna"),
        dependencies: [ArtifactStore.dependencyOn(parentWorld)],
      },
    );

    const engine = new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    );
    const session = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });
    const newExecutionId = session.history[0]?.newExecutionId;
    if (!newExecutionId) throw new Error("Repair produced no new execution");

    return { repaired: store.getByPipeline(newExecutionId), parentWorld };
  }

  it("does not carry the parent's comparison history forward", async () => {
    const { repaired, parentWorld } = await runRepairWithWorld();

    const dna = repaired.find((a) => a.stage === "GAME_DNA");
    expect(dna).toBeDefined();
    // Re-derived, not copied: a carried report would still claim this run had
    // no prior generations while its own parent sits in the same project.
    expect(dna!.producer).toEqual(deterministicProducer("game-dna"));
    const report = dna!.content as {
      outcome: string;
      priorsFound: number;
      priorsCompared: number;
      nearest?: { executionId: string; identical: boolean };
    };
    expect(report.outcome).toBe("compared");
    expect(report.priorsFound).toBe(1);
    expect(report.priorsCompared).toBe(1);
    expect(report.nearest?.executionId).toBe(PARENT_EXECUTION_ID);
    // A repair regenerates Lua and carries the design across, so the structure
    // is unchanged — and saying so is the honest result, not a defect.
    expect(report.nearest?.identical).toBe(true);
  }, 20000);

  it("binds the rebuilt fingerprint to the world model this run carried", async () => {
    const { repaired } = await runRepairWithWorld();

    const dna = repaired.find((a) => a.stage === "GAME_DNA")!;
    const carriedWorld = repaired.find((a) => a.stage === "WORLD_MODEL")!;

    expect(dna.dependencies).toEqual([
      {
        artifactId: carriedWorld.id,
        stage: "WORLD_MODEL",
        contentHash: carriedWorld.contentHash,
      },
    ]);
  }, 20000);
});

describe("NOVELTY-2 the repaired execution gets a reachable verdict", () => {
  async function runRepairWithHistory(extraIdenticalPrior: boolean) {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "Repair Lineage Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });

    const repository = new InMemoryBlueprintRepository();
    await seedBlueprint(repository);
    const store = new ArtifactStore();

    const seedGeneration = async (executionId: string) => {
      const world = await store.store(
        executionId,
        "WORLD_MODEL",
        null,
        buildWorldModel(REPAIR_SOURCES),
        {
          projectId: PROJECT_ID,
          producer: deterministicProducer("world-model"),
        },
      );
      await store.store(
        executionId,
        "GAME_DNA",
        null,
        buildGameDnaReport({
          dna: buildGameDnaFromStoredWorld(world.content)!,
          priorsFound: 0,
          priors: [],
        }),
        {
          projectId: PROJECT_ID,
          producer: deterministicProducer("game-dna"),
          dependencies: [ArtifactStore.dependencyOn(world)],
        },
      );
    };

    if (extraIdenticalPrior) await seedGeneration("exec-unrelated-twin");

    await store.store(
      PARENT_EXECUTION_ID,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: BROKEN_SCRIPTS },
      { projectId: PROJECT_ID },
    );
    await seedGeneration(PARENT_EXECUTION_ID);

    const engine = new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    );
    const session = await engine.run(PROJECT_ID, PARENT_EXECUTION_ID, {
      maxIterations: 1,
      targetScore: 95,
    });
    return session.history[0];
  }

  it("records the verdict on the repair session, the only durable record it has", async () => {
    // `RepairEngine` never writes a `GenerationExecution`, so without this the
    // `repair-preserved` verdict would exist in code and be unreachable in
    // production. Review caught exactly that.
    const record = await runRepairWithHistory(false);

    expect(record?.novelty).toBeDefined();
    expect(record?.novelty?.verdict).toBe("repair-preserved");
    expect(record?.novelty?.duplicateOf).toEqual([]);
    expect(
      record?.novelty?.repairAncestorMatches.map((m) => m.executionId),
    ).toEqual([PARENT_EXECUTION_ID]);
    expect(record?.novelty?.ancestryResolved).toBe(true);
  }, 20000);

  it("still calls out an unrelated identical prior on the repair path", async () => {
    const record = await runRepairWithHistory(true);

    expect(record?.novelty?.verdict).toBe("duplicate");
    expect(record?.novelty?.duplicateOf.map((m) => m.executionId)).toEqual([
      "exec-unrelated-twin",
    ]);
    expect(
      record?.novelty?.repairAncestorMatches.map((m) => m.executionId),
    ).toEqual([PARENT_EXECUTION_ID]);
  }, 20000);
});
