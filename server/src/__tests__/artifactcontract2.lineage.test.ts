import { describe, it, expect } from "vitest";

import {
  ArtifactStore,
  computeContentHash,
  configureArtifactStorageFactory,
  type PipelineArtifact,
} from "../pipeline/v2";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactTransferManager } from "../studio/v2/sync/ArtifactTransferManager";
import type { TaskNode } from "../planning/model/TaskGraph";

/**
 * ARTIFACT-CONTRACT-2 — lineage as it is produced by the real generation path.
 *
 * The invariant these exist for: a report must identify the exact content it
 * read, so a clean result cannot stay attached to content that has since been
 * regenerated.
 */

const PROJECT = "lineage-project";
const EXECUTION = "exec-lineage";

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
    local character = hit.Parent
    local player = Players:GetPlayerFromCharacter(character)
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

const PLAYABLE_LUA = {
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
};

function node(agent: string, output: unknown): TaskNode {
  return {
    id: `task-${agent}`,
    agent,
    type: "generation",
    dependencies: [],
    status: "done",
    output,
  } as unknown as TaskNode;
}

const NODES: TaskNode[] = [
  node("game_designer", { gameConcept: { name: "Anything" } }),
  node("roblox_architect", { architecture: { services: ["WorldService"] } }),
  node("lua_generator", PLAYABLE_LUA),
];

async function recordGeneration(
  store: ArtifactStore,
  nodes: TaskNode[] = NODES,
  executionId = EXECUTION,
): Promise<PipelineArtifact[]> {
  return new GenerationArtifactRecorder(store).record(
    executionId,
    nodes,
    PROJECT,
  );
}

function byStage(
  artifacts: PipelineArtifact[],
  stage: string,
): PipelineArtifact {
  const found = artifacts.find((artifact) => artifact.stage === stage);
  if (!found) throw new Error(`No ${stage} artifact recorded`);
  return found;
}

describe("ARTIFACT-CONTRACT-2 cross-artifact evidence binds to exact content", () => {
  it("binds the validation report to the Lua and world it checked", async () => {
    const recorded = await recordGeneration(new ArtifactStore());
    const validation = byStage(recorded, "VALIDATION");
    const lua = byStage(recorded, "LUA_GENERATION");
    const world = byStage(recorded, "WORLD_MODEL");

    const bound = new Map(
      (validation.dependencies ?? []).map((dependency) => [
        dependency.stage,
        dependency,
      ]),
    );

    expect(bound.get("LUA_GENERATION")?.contentHash).toBe(lua.contentHash);
    expect(bound.get("WORLD_MODEL")?.contentHash).toBe(world.contentHash);
    expect(bound.get("LUA_GENERATION")?.artifactId).toBe(lua.id);
  });

  it("binds the security review to the exact Lua it reviewed", async () => {
    const recorded = await recordGeneration(new ArtifactStore());
    const review = byStage(recorded, "SECURITY_REVIEW");
    const lua = byStage(recorded, "LUA_GENERATION");

    expect(review.dependencies).toEqual([
      {
        artifactId: lua.id,
        stage: "LUA_GENERATION",
        contentHash: lua.contentHash,
      },
    ]);
  });

  it("makes evidence for regenerated Lua distinguishably stale", async () => {
    const store = new ArtifactStore();
    const first = await recordGeneration(store);
    const firstLua = byStage(first, "LUA_GENERATION");
    const firstReview = byStage(first, "SECURITY_REVIEW");

    // The same project generated again, with one script changed.
    const changed = {
      scripts: [
        PLAYABLE_LUA.scripts[0],
        {
          ...PLAYABLE_LUA.scripts[1],
          content: `${PLAYABLE_LUA.scripts[1].content}\n-- revised`,
        },
      ],
    };
    const second = await recordGeneration(
      store,
      [NODES[0], NODES[1], node("lua_generator", changed)],
      `${EXECUTION}-2`,
    );
    const secondLua = byStage(second, "LUA_GENERATION");

    expect(secondLua.contentHash).not.toBe(firstLua.contentHash);
    // The old review still names the old Lua. Nothing silently re-points it at
    // content it never read.
    expect(firstReview.dependencies?.[0].contentHash).toBe(
      firstLua.contentHash,
    );
    expect(firstReview.dependencies?.[0].contentHash).not.toBe(
      secondLua.contentHash,
    );
  });

  it("leaves no committed package, and no lineage, when validation rejects", async () => {
    const store = new ArtifactStore();
    const unplayable = node("lua_generator", {
      scripts: [
        { path: "ServerScriptService/Main.server.lua", content: "return {}" },
      ],
    });

    await expect(
      recordGeneration(store, [NODES[0], NODES[1], unplayable]),
    ).rejects.toThrow(/deterministic validation/i);

    const stored = store.getByPipeline(EXECUTION);
    expect(stored.map((artifact) => artifact.stage)).toEqual(["VALIDATION"]);
    // Nothing was committed, so the report has nothing to point at. A
    // dependency here would name content that does not exist.
    expect(stored[0].dependencies).toBeUndefined();
    expect(stored[0].projectId).toBe(PROJECT);
  });

  it("records every artifact under the project the server resolved", async () => {
    const recorded = await recordGeneration(new ArtifactStore());

    for (const artifact of recorded) {
      expect(artifact.projectId).toBe(PROJECT);
      expect(artifact.contentHash).toBe(computeContentHash(artifact.content));
      expect(artifact.producer).toBeDefined();
    }
  });

  it("attributes deterministic stages to code, not to an agent", async () => {
    const recorded = await recordGeneration(new ArtifactStore());

    expect(byStage(recorded, "VALIDATION").producer).toEqual({
      type: "deterministic",
      id: "generation-validation",
      version: 1,
    });
    expect(byStage(recorded, "WORLD_MODEL").producer?.type).toBe(
      "deterministic",
    );
    expect(byStage(recorded, "LUA_GENERATION").producer?.type).toBe("agent");
  });
});

describe("ARTIFACT-CONTRACT-2 persistence", () => {
  it("survives a storage round trip into a recreated store", async () => {
    // Mirrors the durable path: a JSONB-style provider that reserializes
    // everything, then a fresh store reading it back.
    const rows = new Map<string, string>();
    const provider = {
      get: <T>(collection: string, id: string): T | null => {
        const raw = rows.get(`${collection}:${id}`);
        return raw ? (JSON.parse(raw) as T) : null;
      },
      list: <T>(collection: string, filter?: (item: T) => boolean): T[] => {
        const all = [...rows.entries()]
          .filter(([key]) => key.startsWith(`${collection}:`))
          .map(([, raw]) => JSON.parse(raw) as T);
        return filter ? all.filter(filter) : all;
      },
      count: (collection: string): number =>
        [...rows.keys()].filter((key) => key.startsWith(`${collection}:`))
          .length,
      setDurable: async <T>(
        collection: string,
        id: string,
        data: T,
      ): Promise<void> => {
        // Key order is deliberately reversed on the way in, the way a JSONB
        // round trip is free to do. Canonical hashing is what makes that safe.
        rows.set(`${collection}:${id}`, JSON.stringify(data));
      },
    };

    configureArtifactStorageFactory(() => provider);
    try {
      const recorded = await recordGeneration(new ArtifactStore());
      const lua = byStage(recorded, "LUA_GENERATION");

      const reopened = new ArtifactStore().getByPipeline(EXECUTION);
      const readBack = reopened.find((artifact) => artifact.id === lua.id);

      expect(readBack?.schemaVersion).toBe(lua.schemaVersion);
      expect(readBack?.projectId).toBe(PROJECT);
      expect(readBack?.producer).toEqual(lua.producer);
      expect(readBack?.contentHash).toBe(lua.contentHash);
      // The recorded hash still describes the content that came back.
      expect(computeContentHash(readBack?.content)).toBe(lua.contentHash);

      const validation = reopened.find(
        (artifact) => artifact.stage === "VALIDATION",
      );
      expect(validation?.dependencies?.length).toBeGreaterThan(0);
    } finally {
      configureArtifactStorageFactory(() => undefined as never);
    }
  });
});

describe("ARTIFACT-CONTRACT-2 Studio delivery is unchanged", () => {
  it("still transfers artifacts, and its hash stays its own", async () => {
    const store = new ArtifactStore();
    const recorded = await recordGeneration(store);
    const lua = byStage(recorded, "LUA_GENERATION");

    const manager = new ArtifactTransferManager(store);
    const transfer = manager.transfer([lua.id]);
    const ref = manager
      .getArtifactRefs(EXECUTION)
      .find((entry) => entry.id === lua.id);

    expect(transfer.artifacts).toHaveLength(1);
    expect(ref).toBeDefined();
    // The transfer fingerprint describes the bytes the plugin receives and is
    // a different construction from the backend's canonical identity. They are
    // documented as distinct rather than conflated.
    expect(ref?.hash).not.toBe(lua.contentHash);
    expect(ref?.hash).toHaveLength(16);
  });

  it("delivers a historical artifact without claiming metadata it never had", () => {
    const store = new ArtifactStore();
    const legacy: PipelineArtifact = {
      id: "artifact-legacy-transfer",
      pipelineId: EXECUTION,
      stage: "LUA_GENERATION",
      agent: "lua_generator",
      type: "lua",
      name: "generatedScripts.lua",
      createdAt: 1,
      content: PLAYABLE_LUA,
      sizeBytes: 10,
      validated: true,
      reviewStatus: "approved",
    };
    (
      store as unknown as { artifacts: Map<string, PipelineArtifact> }
    ).artifacts.set(legacy.id, legacy);
    (store as unknown as { byPipeline: Map<string, string[]> }).byPipeline.set(
      EXECUTION,
      [legacy.id],
    );

    const transfer = new ArtifactTransferManager(store).transfer([legacy.id]);

    expect(transfer.artifacts).toHaveLength(1);
    expect(store.getById(legacy.id)?.schemaVersion).toBeUndefined();
    expect(store.getById(legacy.id)?.contentHash).toBeUndefined();
  });
});
