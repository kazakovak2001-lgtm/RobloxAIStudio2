import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactStore,
  deterministicProducer,
  type PipelineArtifact,
} from "../pipeline/v2";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactTransferManager } from "../studio/v2/sync/ArtifactTransferManager";
import {
  StudioRuntime,
  resetSharedStudioRuntimeForTests,
} from "../studio/v2/StudioRuntime";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { RepairEngine } from "../repair/RepairEngine";
import { InMemoryRepairSessionStore } from "../repair/RepairSessionStore";
import { buildWorldModel } from "../validation/worldModel";
import type { TaskNode } from "../planning/model/TaskGraph";
import {
  LEGACY_WORLD_RUNTIME_MODE,
  resolveWorldRuntimeMode,
  resolveWorldRuntimeModeFromContent,
} from "../types/worldRuntimeMode";

/**
 * WORLD-1C, first vertical slice.
 *
 * Three things are under test, and none of them is the ownership switch:
 * that runtime world ownership is *stated* rather than inferred, that an
 * explicit package is publishable only through one durable marker written
 * last, and that delivery refuses a package that marker no longer describes.
 *
 * `materialized-world` is never produced by any path here. Nothing generates
 * it, and the repair case below asserts it stays undeliverable.
 */

const PROJECT_ID = "world1c-project";

const PLAYABLE_SERVER = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace

local spawnPad = Instance.new("SpawnLocation")
spawnPad.Size = Vector3.new(12, 1, 12)
spawnPad.Position = Vector3.new(0, 1, 0)
spawnPad.Anchored = true
spawnPad.Parent = arena

local collected = {}

for index = 1, 5 do
  local orb = Instance.new("Part")
  orb.Name = "Orb" .. index
  orb.Shape = Enum.PartType.Ball
  orb.Size = Vector3.new(2, 2, 2)
  orb.Position = Vector3.new(index * 6, 3, 0)
  orb.Anchored = true
  orb.Parent = arena

  orb.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if not player then
      return
    end
    if collected[orb] then
      return
    end
    collected[orb] = true
    orb:Destroy()

    local score = 0
    for _, taken in pairs(collected) do
      if taken then
        score = score + 1
      end
    end
    progress:FireAllClients(score, 5)
  end)
end

Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player

  local score = Instance.new("IntValue")
  score.Name = "Score"
  score.Parent = stats
end)
`;

const PLAYABLE_CLIENT = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Name = "Progress"
label.Size = UDim2.new(0, 220, 0, 48)
label.Position = UDim2.new(0, 16, 0, 16)
label.Text = "Orbs: 0/5"
label.Parent = gui

local progress = ReplicatedStorage:WaitForChild("OrbProgress")
progress.OnClientEvent:Connect(function(score, goal)
  label.Text = "Orbs: " .. tostring(score) .. "/" .. tostring(goal)
end)
`;

function node(agent: string, output: Record<string, unknown>): TaskNode {
  return {
    id: `task-${agent}`,
    agent,
    type: "stage",
    input: {},
    dependencies: [],
    status: "done",
    priority: 1,
    output,
  };
}

function playableNodes(): TaskNode[] {
  return [
    node("game_designer", {
      gameplay: {
        mechanics: [{ name: "collect" }],
        balance: { winCondition: "Collect them all" },
      },
    }),
    node("roblox_architect", {
      architecture: { services: { SpawnService: "spawns" } },
    }),
    node("lua_generator", {
      scripts: [
        {
          path: "ServerScriptService/OrbArena.server.lua",
          content: PLAYABLE_SERVER,
        },
        {
          path: "StarterPlayerScripts/OrbHud.client.lua",
          content: PLAYABLE_CLIENT,
        },
      ],
    }),
  ];
}

function unplayableNodes(): TaskNode[] {
  return [
    node("game_designer", { gameplay: { mechanics: [] } }),
    node("lua_generator", {
      scripts: [
        {
          path: "ServerScriptService/Stub.server.lua",
          content: "print('nothing here')\n",
        },
      ],
    }),
  ];
}

// ─── Mode resolution ────────────────────────────────────────────────────────

describe("WORLD-1C world runtime mode resolution", () => {
  it("reads an absent mode as the historical lua-owned mode", () => {
    // Executions recorded before WORLD-1C have no field and were lua-owned by
    // construction. `explicit` is what keeps that from being mistaken for a
    // record that chose the mode.
    expect(resolveWorldRuntimeMode(undefined)).toEqual({
      mode: LEGACY_WORLD_RUNTIME_MODE,
      explicit: false,
    });
    expect(resolveWorldRuntimeModeFromContent({ scene: {} })).toEqual({
      mode: "lua-owned",
      explicit: false,
    });
  });

  it("reads a stated mode as stated", () => {
    expect(
      resolveWorldRuntimeModeFromContent({ worldRuntimeMode: "lua-owned" }),
    ).toEqual({ mode: "lua-owned", explicit: true });
    expect(
      resolveWorldRuntimeModeFromContent({
        worldRuntimeMode: "materialized-world",
      }),
    ).toEqual({ mode: "materialized-world", explicit: true });
  });

  it("refuses an unrecognised mode instead of falling back to lua-owned", () => {
    // Falling back here would reinterpret a record written by a newer or
    // corrupted schema as a historical one, which is the single thing the
    // compatibility rule forbids.
    expect(() =>
      resolveWorldRuntimeModeFromContent({ worldRuntimeMode: "workspace" }),
    ).toThrow(/Unknown world runtime mode/);
    expect(() =>
      resolveWorldRuntimeModeFromContent({ worldRuntimeMode: null }),
    ).toThrow(/Unknown world runtime mode/);
  });
});

// ─── Legacy compatibility ───────────────────────────────────────────────────

describe("WORLD-1C historical packages stay deliverable", () => {
  it("delivers a package whose artifacts state no mode, with no commit marker", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    await store.store(
      "legacy-exec",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [] },
      { projectId: PROJECT_ID },
    );
    await store.store(
      "legacy-exec",
      "WORLD_MODEL",
      null,
      // A pre-WORLD-1C world model: no `worldRuntimeMode` key at all.
      buildWorldModel({ gameDesign: {}, architecture: {} }),
      { projectId: PROJECT_ID, producer: deterministicProducer("world-model") },
    );

    expect(store.getPackageCommit("legacy-exec")).toBeNull();
    expect(
      store
        .getDeliverableArtifacts("legacy-exec")
        .map((a) => a.stage)
        .sort(),
    ).toEqual(["LUA_GENERATION", "WORLD_MODEL"]);
    expect(
      new ArtifactTransferManager(store).getArtifactRefs("legacy-exec"),
    ).toHaveLength(2);
  });
});

// ─── Fail-closed on an explicit package with no marker ──────────────────────

describe("WORLD-1C explicit packages are publishable only through the marker", () => {
  it("refuses an explicit package that was never committed", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    await store.store(
      "uncommitted-exec",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [] },
      { projectId: PROJECT_ID },
    );
    await store.store(
      "uncommitted-exec",
      "WORLD_MODEL",
      null,
      { ...buildWorldModel({}), worldRuntimeMode: "lua-owned" },
      { projectId: PROJECT_ID, producer: deterministicProducer("world-model") },
    );

    // The artifacts exist and stay inspectable — this is a delivery rule, not
    // a storage rule.
    expect(store.getByPipeline("uncommitted-exec")).toHaveLength(2);
    expect(store.getDeliverableArtifacts("uncommitted-exec")).toEqual([]);
  });

  it("refuses when only a stage written after the world model states a mode", async () => {
    // Reading only the newest mode carrier would hand this back to the
    // historical path, because the last write here is the one with no mode.
    const store = new ArtifactStore(new InMemoryStorageProvider());
    await store.store(
      "later-silent-exec",
      "VALIDATION",
      null,
      { passed: true, worldRuntimeMode: "lua-owned" },
      {
        projectId: PROJECT_ID,
        producer: deterministicProducer("generation-validation"),
      },
    );
    await store.store(
      "later-silent-exec",
      "WORLD_MODEL",
      null,
      buildWorldModel({}),
      { projectId: PROJECT_ID, producer: deterministicProducer("world-model") },
    );

    expect(store.getDeliverableArtifacts("later-silent-exec")).toEqual([]);
  });

  it("refuses a package whose commit names an artifact that is not there", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const world = await store.store(
      "phantom-exec",
      "WORLD_MODEL",
      null,
      { ...buildWorldModel({}), worldRuntimeMode: "lua-owned" },
      { projectId: PROJECT_ID, producer: deterministicProducer("world-model") },
    );
    const lua = await store.store(
      "phantom-exec",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [] },
      { projectId: PROJECT_ID },
    );
    await store.commitPackage({
      pipelineId: "phantom-exec",
      projectId: PROJECT_ID,
      worldRuntimeMode: "lua-owned",
      source: "repair",
      artifacts: [
        world,
        lua,
        // Never written. A marker naming content nobody stored describes an
        // incomplete package, so the whole package is withheld.
        { ...lua, stage: "GAME_DNA", id: "artifact-never-written" },
      ],
    });

    expect(store.getDeliverableArtifacts("phantom-exec")).toEqual([]);
  });

  it("refuses to commit a package missing a required stage", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const lua = await store.store(
      "no-world-exec",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [] },
      { projectId: PROJECT_ID },
    );

    await expect(
      store.commitPackage({
        pipelineId: "no-world-exec",
        projectId: PROJECT_ID,
        worldRuntimeMode: "lua-owned",
        source: "repair",
        artifacts: [lua],
      }),
    ).rejects.toThrow(/WORLD_MODEL and LUA_GENERATION/);
    expect(store.getPackageCommit("no-world-exec")).toBeNull();
  });

  it("refuses a commit whose stated mode contradicts the world model", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const world = await store.store(
      "contradiction-exec",
      "WORLD_MODEL",
      null,
      { ...buildWorldModel({}), worldRuntimeMode: "materialized-world" },
      { projectId: PROJECT_ID, producer: deterministicProducer("world-model") },
    );
    const lua = await store.store(
      "contradiction-exec",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [] },
      { projectId: PROJECT_ID },
    );

    await expect(
      store.commitPackage({
        pipelineId: "contradiction-exec",
        projectId: PROJECT_ID,
        worldRuntimeMode: "lua-owned",
        source: "repair",
        artifacts: [world, lua],
      }),
    ).rejects.toThrow(/does not match package mode/);
  });
});

// ─── Durable reconstruction ─────────────────────────────────────────────────

describe("WORLD-1C the commit boundary survives a restart", () => {
  it("reconstructs the package from durable state in a store that never wrote it", async () => {
    const storage = new InMemoryStorageProvider();
    const before = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(before);
    await recorder.record("restart-exec", playableNodes(), PROJECT_ID, {
      worldRuntimeMode: "lua-owned",
    });

    // A process restart: same durable storage, a store instance holding no
    // in-memory commit at all.
    const after = new ArtifactStore(storage);

    const commit = after.getPackageCommit(PROJECT_ID, "restart-exec");
    expect(commit).not.toBeNull();
    expect(commit!.worldRuntimeMode).toBe("lua-owned");
    expect(commit!.source).toBe("generation");

    const delivered = after.getDeliverableArtifacts(PROJECT_ID, "restart-exec");
    expect(delivered.map((a) => a.stage)).toContain("WORLD_MODEL");
    expect(delivered.map((a) => a.stage)).toContain("LUA_GENERATION");
    expect(delivered.map((a) => a.stage)).toContain("VALIDATION");
    expect(delivered.map((a) => a.id).sort()).toEqual(
      commit!.artifacts.map((ref) => ref.artifactId).sort(),
    );
  });

  it("withholds an explicit package whose marker never reached storage", async () => {
    const storage = new InMemoryStorageProvider();
    const before = new ArtifactStore(storage);
    const recorder = new GenerationArtifactRecorder(before);
    await recorder.record("lost-marker-exec", playableNodes(), PROJECT_ID, {
      worldRuntimeMode: "lua-owned",
    });

    // The marker is the last durable write, so a crash before it lands leaves
    // exactly this state: every stage artifact present, no marker.
    storage.delete(
      "generation_package_commits",
      `${PROJECT_ID}:lost-marker-exec`,
    );

    const after = new ArtifactStore(storage);
    expect(after.getPackageCommit(PROJECT_ID, "lost-marker-exec")).toBeNull();
    expect(after.getByPipeline("lost-marker-exec").length).toBeGreaterThan(0);
    expect(
      after.getDeliverableArtifacts(PROJECT_ID, "lost-marker-exec"),
    ).toEqual([]);
  });
});

// ─── Tenant isolation ───────────────────────────────────────────────────────

describe("WORLD-1C package commits are tenant-scoped", () => {
  async function commitRepairPackage(
    store: ArtifactStore,
    pipelineId: string,
    projectId: string,
  ) {
    const world = await store.store(
      pipelineId,
      "WORLD_MODEL",
      null,
      { ...buildWorldModel({}), worldRuntimeMode: "lua-owned" },
      { projectId, producer: deterministicProducer("world-model") },
    );
    const lua = await store.store(
      pipelineId,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [] },
      { projectId },
    );
    return store.commitPackage({
      pipelineId,
      projectId,
      worldRuntimeMode: "lua-owned",
      source: "repair",
      artifacts: [world, lua],
    });
  }

  it("keeps identical pipeline ids independent across projects", async () => {
    const storage = new InMemoryStorageProvider();
    const store = new ArtifactStore(storage);
    const pipelineId = "shared-exec";
    const projectA = "project-a";
    const projectB = "project-b";

    await commitRepairPackage(store, pipelineId, projectA);
    await commitRepairPackage(store, pipelineId, projectB);

    expect(store.getPackageCommit(projectA, pipelineId)?.projectId).toBe(
      projectA,
    );
    expect(store.getPackageCommit(projectB, pipelineId)?.projectId).toBe(
      projectB,
    );
    expect(
      store
        .getDeliverableArtifacts(projectA, pipelineId)
        .every((artifact) => artifact.projectId === projectA),
    ).toBe(true);
    expect(
      store
        .getDeliverableArtifacts(projectB, pipelineId)
        .every((artifact) => artifact.projectId === projectB),
    ).toBe(true);

    // The compatibility one-argument path cannot choose a tenant when the raw
    // pipeline namespace is ambiguous, so it fails closed rather than leaking.
    expect(store.getDeliverableArtifacts(pipelineId)).toEqual([]);

    const afterRestart = new ArtifactStore(storage);
    expect(afterRestart.getPackageCommit(projectA, pipelineId)?.projectId).toBe(
      projectA,
    );
    expect(afterRestart.getPackageCommit(projectB, pipelineId)?.projectId).toBe(
      projectB,
    );
  });

  it("returns no committed package for the wrong project", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    await commitRepairPackage(store, "tenant-exec", PROJECT_ID);

    expect(store.getPackageCommit("other-project", "tenant-exec")).toBeNull();
    expect(
      store.getDeliverableArtifacts("other-project", "tenant-exec"),
    ).toEqual([]);
    expect(
      store.getDeliverableArtifacts(PROJECT_ID, "tenant-exec").length,
    ).toBe(2);
  });
});

// ─── Mutation invalidation ──────────────────────────────────────────────────

describe("WORLD-1C a mutated package stops being deliverable", () => {
  it("withholds the whole package after one committed artifact is edited", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const recorder = new GenerationArtifactRecorder(store);
    const recorded = await recorder.record(
      "mutated-exec",
      playableNodes(),
      PROJECT_ID,
      { worldRuntimeMode: "lua-owned" },
    );
    const transfer = new ArtifactTransferManager(store);
    expect(transfer.getArtifactRefs("mutated-exec").length).toBe(
      recorded.length,
    );

    const world = recorded.find(
      (artifact) => artifact.stage === "WORLD_MODEL",
    ) as PipelineArtifact;
    await store.edit(world.id, { tampered: true }, "studio-sync");

    // Not just the edited artifact: the commit described a set, and one member
    // no longer being what the marker named makes the set incoherent.
    expect(store.getDeliverableArtifacts("mutated-exec")).toEqual([]);
    expect(transfer.getArtifactRefs("mutated-exec")).toEqual([]);
    expect(transfer.transfer(recorded.map((a) => a.id)).artifacts).toEqual([]);
    expect(transfer.transfer(recorded.map((a) => a.id)).missing.length).toBe(
      recorded.length,
    );
  });

  it("keeps the artifacts themselves readable after invalidation", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const recorder = new GenerationArtifactRecorder(store);
    const recorded = await recorder.record(
      "inspectable-exec",
      playableNodes(),
      PROJECT_ID,
      { worldRuntimeMode: "lua-owned" },
    );
    const lua = recorded.find((a) => a.stage === "LUA_GENERATION")!;
    await store.edit(lua.id, { scripts: [] }, "studio-sync");

    expect(store.getDeliverableArtifacts("inspectable-exec")).toEqual([]);
    expect(store.getById(lua.id)?.reviewStatus).toBe("edited");
    expect(store.getByPipeline("inspectable-exec").length).toBe(
      recorded.length,
    );
  });
});

// ─── Generation ─────────────────────────────────────────────────────────────

describe("WORLD-1C generation commits one coherent package", () => {
  it("states the mode on the world model and on the validation report", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const recorded = await new GenerationArtifactRecorder(store).record(
      "generation-exec",
      playableNodes(),
      PROJECT_ID,
      { worldRuntimeMode: "lua-owned" },
    );

    const world = recorded.find((a) => a.stage === "WORLD_MODEL")!;
    const validation = recorded.find((a) => a.stage === "VALIDATION")!;

    expect(
      (world.content as { worldRuntimeMode?: string }).worldRuntimeMode,
    ).toBe("lua-owned");
    expect(
      (validation.content as { worldRuntimeMode?: string }).worldRuntimeMode,
    ).toBe("lua-owned");
  });

  it("writes the marker last, over every artifact the run recorded", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    const recorded = await new GenerationArtifactRecorder(store).record(
      "marker-order-exec",
      playableNodes(),
      PROJECT_ID,
      { worldRuntimeMode: "lua-owned" },
    );

    const commit = store.getPackageCommit("marker-order-exec")!;
    expect(commit.artifacts.map((ref) => ref.artifactId)).toEqual(
      recorded.map((artifact) => artifact.id),
    );
    // Every reference binds to the exact bytes that were stored, which is what
    // makes a later edit detectable rather than silent.
    for (const ref of commit.artifacts) {
      expect(store.getById(ref.artifactId)!.contentHash).toBe(ref.contentHash);
    }
    expect(commit.committedAt).toBeGreaterThanOrEqual(
      Math.max(...recorded.map((artifact) => artifact.createdAt)),
    );
  });

  it("commits nothing when deterministic validation rejects the run", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());

    await expect(
      new GenerationArtifactRecorder(store).record(
        "rejected-exec",
        unplayableNodes(),
        PROJECT_ID,
        { worldRuntimeMode: "lua-owned" },
      ),
    ).rejects.toThrow(/deterministic validation/);

    expect(store.getPackageCommit("rejected-exec")).toBeNull();
    // The report saying why is still there, and is still not deliverable.
    expect(store.getByPipeline("rejected-exec").map((a) => a.stage)).toEqual([
      "VALIDATION",
    ]);
    expect(store.getDeliverableArtifacts("rejected-exec")).toEqual([]);
  });

  it("defaults to lua-owned when a caller states no mode", async () => {
    const store = new ArtifactStore(new InMemoryStorageProvider());
    await new GenerationArtifactRecorder(store).record(
      "defaulted-exec",
      playableNodes(),
      PROJECT_ID,
    );

    expect(store.getPackageCommit("defaulted-exec")!.worldRuntimeMode).toBe(
      "lua-owned",
    );
  });
});

// ─── Repair ─────────────────────────────────────────────────────────────────

describe("WORLD-1C repair carries the mode without widening it", () => {
  async function runRepair(worldContent: Record<string, unknown>) {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator agent missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "World 1C Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });

    const repository = new InMemoryBlueprintRepository();
    await repository.createBlueprint("world1c-user", {
      project_id: PROJECT_ID,
      user_id: "world1c-user",
      name: "World 1C Game",
      description: "A blueprint used only to exercise repair ownership mode.",
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

    const store = new ArtifactStore(new InMemoryStorageProvider());
    await store.store(
      "repair-parent",
      "LUA_GENERATION",
      "lua_generator",
      {
        scripts: [
          {
            path: "ServerScriptService/World.server.lua",
            content: "local world = Instance.new('Folder')\n",
          },
        ],
      },
      { projectId: PROJECT_ID },
    );
    const parentWorld = await store.store(
      "repair-parent",
      "WORLD_MODEL",
      null,
      worldContent,
      {
        projectId: PROJECT_ID,
        producer: deterministicProducer("world-model"),
      },
    );
    const parentValidation = await store.store(
      "repair-parent",
      "VALIDATION",
      null,
      { passed: true, worldRuntimeMode: worldContent.worldRuntimeMode },
      {
        projectId: PROJECT_ID,
        producer: deterministicProducer("generation-validation"),
      },
    );
    const parentLua = store
      .getByPipeline("repair-parent")
      .find((a) => a.stage === "LUA_GENERATION")!;
    await store.commitPackage({
      pipelineId: "repair-parent",
      projectId: PROJECT_ID,
      worldRuntimeMode: resolveWorldRuntimeModeFromContent(worldContent).mode,
      source: "generation",
      artifacts: [parentWorld, parentLua, parentValidation],
    });

    const session = await new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    ).run(PROJECT_ID, "repair-parent", { maxIterations: 1, targetScore: 95 });
    const newExecutionId = session.history[0]?.newExecutionId;
    if (!newExecutionId) throw new Error("Repair produced no new execution");

    return { store, newExecutionId };
  }

  it("publishes a repaired lua-owned package under its own marker", async () => {
    const world = {
      ...buildWorldModel({
        gameDesign: { gameplay: { mechanics: [{ name: "collect" }] } },
        architecture: { architecture: { services: { Spawn: "spawns" } } },
      }),
      worldRuntimeMode: "lua-owned",
    };
    const { store, newExecutionId } = await runRepair(world);

    const commit = store.getPackageCommit(newExecutionId);
    expect(commit).not.toBeNull();
    expect(commit!.worldRuntimeMode).toBe("lua-owned");
    expect(commit!.source).toBe("repair");

    const delivered = store.getDeliverableArtifacts(newExecutionId);
    expect(delivered.map((a) => a.stage).sort()).toEqual([
      "GAME_DNA",
      "LUA_GENERATION",
      "SECURITY_REVIEW",
      "WORLD_MODEL",
    ]);
    // The repaired world carries the mode across unchanged: a rollback must be
    // able to state the ownership of the package it redelivers.
    const repairedWorld = delivered.find((a) => a.stage === "WORLD_MODEL")!;
    expect(resolveWorldRuntimeModeFromContent(repairedWorld.content)).toEqual({
      mode: "lua-owned",
      explicit: true,
    });
  }, 30000);

  it("refuses to publish a repaired materialized-world package", async () => {
    // The repair acceptance gate is still `getPlayableLuaIssues`, which is the
    // lua-owned contract — it would accept world-building Lua beside a
    // materialized world. Until that gate is mode-aware, the repair persists
    // its artifacts and writes no marker, so delivery withholds them.
    const world = {
      ...buildWorldModel({
        gameDesign: { gameplay: { mechanics: [{ name: "collect" }] } },
        architecture: { architecture: { services: { Spawn: "spawns" } } },
      }),
      worldRuntimeMode: "materialized-world",
    };
    const { store, newExecutionId } = await runRepair(world);

    expect(store.getPackageCommit(newExecutionId)).toBeNull();
    expect(store.getDeliverableArtifacts(newExecutionId)).toEqual([]);
    // The repair itself still ran and still persisted what it produced.
    expect(store.getByPipeline(newExecutionId).map((a) => a.stage)).toContain(
      "LUA_GENERATION",
    );
    const carried = store
      .getByPipeline(newExecutionId)
      .find((a) => a.stage === "WORLD_MODEL")!;
    expect(resolveWorldRuntimeModeFromContent(carried.content).mode).toBe(
      "materialized-world",
    );
  }, 30000);

  it("reads the parent package through the delivery view, not the raw pipeline", async () => {
    // A repair that assembled its input from artifacts delivery would refuse
    // would produce a package nobody is allowed to ship.
    const world = {
      ...buildWorldModel({
        gameDesign: { gameplay: { mechanics: [{ name: "collect" }] } },
        architecture: { architecture: { services: { Spawn: "spawns" } } },
      }),
      worldRuntimeMode: "lua-owned",
    };
    const { store, newExecutionId } = await runRepair(world);

    const parentDelivered = store.getDeliverableArtifacts("repair-parent");
    expect(parentDelivered.map((a) => a.stage).sort()).toEqual([
      "LUA_GENERATION",
      "VALIDATION",
      "WORLD_MODEL",
    ]);
    expect(store.getDeliverableArtifacts(newExecutionId).length).toBe(4);
  }, 30000);
});

// ─── Studio delivery ────────────────────────────────────────────────────────

describe("WORLD-1C Studio delivery refuses an incoherent package", () => {
  afterEach(() => {
    resetSharedStudioRuntimeForTests();
  });

  async function connectedRuntime() {
    const runtime = new StudioRuntime({
      storage: new InMemoryStorageProvider(),
    });
    const client = runtime.bridge.connect("0.650", PROJECT_ID);
    runtime.sessions.create(client);
    return { runtime, clientId: client.clientId };
  }

  it("exports a committed package", async () => {
    const { runtime, clientId } = await connectedRuntime();
    const recorded = await new GenerationArtifactRecorder(
      runtime.artifacts,
    ).record("deliver-exec", playableNodes(), PROJECT_ID, {
      worldRuntimeMode: "lua-owned",
    });

    const queued = await runtime.queueProjectExport(
      clientId,
      PROJECT_ID,
      "deliver-exec",
    );

    expect(queued.success).toBe(true);
    if (!queued.success) return;
    expect(queued.data.transfer.artifacts).toHaveLength(recorded.length);
    expect(queued.data.transfer.missing).toEqual([]);
  });

  it("refuses to export an explicit package that was never committed", async () => {
    const { runtime, clientId } = await connectedRuntime();
    await runtime.artifacts.store(
      "uncommitted-deliver",
      "WORLD_MODEL",
      null,
      { ...buildWorldModel({}), worldRuntimeMode: "lua-owned" },
      { projectId: PROJECT_ID, producer: deterministicProducer("world-model") },
    );
    await runtime.artifacts.store(
      "uncommitted-deliver",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [] },
      { projectId: PROJECT_ID },
    );

    const queued = await runtime.queueProjectExport(
      clientId,
      PROJECT_ID,
      "uncommitted-deliver",
    );

    expect(queued.success).toBe(false);
    if (queued.success) return;
    expect(queued.reason).toBe("no_artifacts");
    expect(runtime.bridge.getPendingCommandCount(clientId)).toBe(0);
  });

  it("queues nothing when the package stops being deliverable mid-export", async () => {
    // The snapshot and the transfer are two separate reads of the delivery
    // view. Without the guard this queued an EXPORT_PROJECT command carrying
    // zero artifacts and reported it as a successful sync.
    const { runtime, clientId } = await connectedRuntime();
    await new GenerationArtifactRecorder(runtime.artifacts).record(
      "raced-exec",
      playableNodes(),
      PROJECT_ID,
      { worldRuntimeMode: "lua-owned" },
    );

    const real = runtime.artifacts.getDeliverableArtifacts.bind(
      runtime.artifacts,
    );
    let reads = 0;
    vi.spyOn(runtime.artifacts, "getDeliverableArtifacts").mockImplementation(
      (pipelineId: string) => (reads++ === 0 ? real(pipelineId) : []),
    );

    const queued = await runtime.queueProjectExport(
      clientId,
      PROJECT_ID,
      "raced-exec",
    );

    expect(queued.success).toBe(false);
    if (queued.success) return;
    expect(queued.reason).toBe("no_artifacts");
    expect(runtime.bridge.getPendingCommandCount(clientId)).toBe(0);
    expect(await runtime.getProjectEvidence(PROJECT_ID)).toBeNull();
  });
});
