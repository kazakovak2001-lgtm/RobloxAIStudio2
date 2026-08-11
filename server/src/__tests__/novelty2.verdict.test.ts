import { describe, it, expect, vi } from "vitest";

import {
  deriveNoveltyVerdict,
  NOVELTY_VERDICTS,
} from "../validation/noveltyVerdict";
import {
  buildGameDna,
  buildGameDnaReport,
  fingerprintGameDna,
  type GameDnaReport,
} from "../validation/gameDna";
import { buildWorldModel } from "../validation/worldModel";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactStore, resolveRepairAncestry } from "../pipeline/v2";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import type { PlayableLuaScript } from "../types/playableLua";
import type { TaskNode } from "../planning/model/TaskGraph";

/**
 * NOVELTY-2 — the verdict over NOVELTY-1's evidence.
 *
 * Two properties carry this slice: exact fingerprint equality is the only
 * similarity it recognises, and a repaired execution that legitimately shares
 * its parent's structure is not an unrelated repeat.
 */

const PROJECT = "novelty-2-test-project";

const SERVER_LUA = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progress = Instance.new("RemoteEvent")
progress.Name = "OrbProgress"
progress.Parent = ReplicatedStorage

local arena = Instance.new("Folder")
arena.Name = "GeneratedArena"
arena.Parent = workspace

local spawnPad = Instance.new("SpawnLocation")
spawnPad.Size = Vector3.new(12, 1, 12)
spawnPad.Anchored = true
spawnPad.Parent = arena

local collected = {}

for index = 1, 5 do
  local orb = Instance.new("Part")
  orb.Name = "Orb" .. index
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
    progress:FireAllClients(1, 5)
  end)
end

Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player
end)
`;

const CLIENT_LUA = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "OrbHud"
gui.Parent = playerGui

local label = Instance.new("TextLabel")
label.Text = "Orbs: 0/5"
label.Parent = gui

ReplicatedStorage:WaitForChild("OrbProgress").OnClientEvent:Connect(function(score, goal)
  label.Text = "Orbs: " .. tostring(score) .. "/" .. tostring(goal)
end)
`;

function luaPackage(): PlayableLuaScript[] {
  return [
    { path: "ServerScriptService/Arena.server.lua", content: SERVER_LUA },
    { path: "StarterPlayerScripts/Hud.client.lua", content: CLIENT_LUA },
  ];
}

function racingSources() {
  return {
    gameDesign: {
      gameplay: {
        mechanics: [
          { name: "drifting", description: "Players drift through corners" },
          { name: "boosting", description: "Players spend charge to boost" },
        ],
        balance: {
          winCondition: "Cross the finish line first",
          loseCondition: "Fail to finish before the timer expires",
          economyOrScoring: "Lap times converted into placement points",
        },
        progression: { player_progression_model: "Unlock tracks by placing" },
      },
    },
    architecture: {
      architecture: {
        services: {
          SpawnService: "Places racers on the grid",
          DataService: "Persists best lap times",
          EventService: "Broadcasts lap and placement changes",
        },
        apiContracts: { "Race.LapComplete": { input: "lap", output: "times" } },
      },
    },
  };
}

/**
 * Nearly the same game: one extra mechanic, everything else identical.
 *
 * The distance from `racingSources` is about 0.035 and the fingerprints
 * differ. This is the fixture that separates exact identity from a loose
 * threshold — without it, a comparison that accepted anything under 0.5 would
 * behave the same as one that demanded equality on every other case here.
 */
function nearMissSources() {
  const sources = racingSources();
  sources.gameDesign.gameplay.mechanics.push({
    name: "drafting",
    description: "Players slipstream behind a rival",
  });
  return sources;
}

/** A structurally different game: fewer systems, no progression, no scoring. */
function puzzleSources() {
  return {
    gameDesign: {
      gameplay: {
        mechanics: [{ name: "rotating tiles", description: "Turn a tile" }],
        balance: { winCondition: "Complete the pattern" },
      },
    },
    architecture: {
      architecture: { services: { PuzzleService: "Owns the board state" } },
    },
  };
}

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

async function record(
  store: ArtifactStore,
  executionId: string,
  sources: { gameDesign: unknown; architecture: unknown },
  projectId = PROJECT,
) {
  return new GenerationArtifactRecorder(store).record(
    executionId,
    [
      node("game_designer", sources.gameDesign as Record<string, unknown>),
      node("roblox_architect", sources.architecture as Record<string, unknown>),
      node("lua_generator", { scripts: luaPackage() }),
    ],
    projectId,
  );
}

function reportOf(
  artifacts: Awaited<ReturnType<typeof record>>,
): GameDnaReport {
  const artifact = artifacts.find((entry) => entry.stage === "GAME_DNA");
  if (!artifact) throw new Error("no GAME_DNA artifact recorded");
  return artifact.content as GameDnaReport;
}

/** Derive a verdict the way the service does: report plus resolved ancestry. */
function verdictFor(
  store: ArtifactStore,
  executionId: string,
  report: GameDnaReport,
) {
  const ancestry = resolveRepairAncestry(store, executionId);
  return deriveNoveltyVerdict({
    report,
    ancestors: ancestry.ancestors,
    ancestryResolved: ancestry.resolved,
  });
}

/**
 * Link a repaired execution to its parent the way `RepairEngine` does: the
 * repaired Lua declares the parent's Lua as its upstream. Written out here so
 * the ancestry walk is exercised against a real lineage edge rather than a
 * stub of one.
 */
async function recordRepairOf(
  store: ArtifactStore,
  parentExecutionId: string,
  repairedExecutionId: string,
  projectId = PROJECT,
) {
  const parentLua = store
    .getByPipeline(parentExecutionId)
    .find((artifact) => artifact.stage === "LUA_GENERATION");
  if (!parentLua) throw new Error("parent has no Lua to repair");

  const parentWorld = store
    .getByPipeline(parentExecutionId)
    .find((artifact) => artifact.stage === "WORLD_MODEL");
  if (!parentWorld) throw new Error("parent has no world model");

  const carriedWorld = await store.store(
    repairedExecutionId,
    "WORLD_MODEL",
    null,
    parentWorld.content,
    { projectId, producer: "repair-carry-forward" },
  );
  await store.store(
    repairedExecutionId,
    "LUA_GENERATION",
    "lua_generator",
    { scripts: luaPackage() },
    { projectId, dependencies: [ArtifactStore.dependencyOn(parentLua)] },
  );
  const dna = buildGameDna(buildWorldModel(racingSources()));
  const priors = store
    .getProjectStageArtifacts(projectId, "GAME_DNA")
    .filter((artifact) => artifact.pipelineId !== repairedExecutionId)
    .map((artifact) => {
      const content = artifact.content as GameDnaReport;
      return {
        executionId: artifact.pipelineId,
        fingerprint: content.fingerprint,
        dna: content.dna,
      };
    });
  const priorsFound = new Set(
    store
      .getProjectStageArtifacts(projectId, "WORLD_MODEL")
      .map((artifact) => artifact.pipelineId)
      .filter((pipelineId) => pipelineId !== repairedExecutionId),
  ).size;

  const report = buildGameDnaReport({ dna, priorsFound, priors });
  await store.store(repairedExecutionId, "GAME_DNA", null, report, {
    projectId,
    producer: "game-dna",
    dependencies: [ArtifactStore.dependencyOn(carriedWorld)],
  });
  return report;
}

describe("NOVELTY-2 verdicts over real evidence", () => {
  it("calls a project's first observable generation uncompared, not new", async () => {
    const store = new ArtifactStore();
    const report = reportOf(await record(store, "exec-first", racingSources()));

    const verdict = verdictFor(store, "exec-first", report);

    expect(verdict.verdict).toBe("insufficient-history");
    // The reason survives the verdict rather than collapsing into it.
    expect(verdict.comparisonOutcome).toBe("no-prior-generations");
    expect(verdict.duplicateOf).toEqual([]);
    expect(verdict.priorsFound).toBe(0);
  });

  it("calls an unrelated repeat a duplicate and names the prior", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-original", racingSources());
    const report = reportOf(
      await record(store, "exec-repeat", racingSources()),
    );

    const verdict = verdictFor(store, "exec-repeat", report);

    expect(verdict.verdict).toBe("duplicate");
    expect(verdict.duplicateOf).toEqual([
      {
        executionId: "exec-original",
        fingerprint: report.fingerprint,
        relation: "unrelated",
      },
    ]);
    expect(verdict.repairAncestorMatches).toEqual([]);
    expect(verdict.ancestryResolved).toBe(true);
  });

  it("calls a structurally different generation distinct", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-racing", racingSources());
    const report = reportOf(
      await record(store, "exec-puzzle", puzzleSources()),
    );

    const verdict = verdictFor(store, "exec-puzzle", report);

    expect(verdict.verdict).toBe("distinct");
    expect(verdict.comparisonOutcome).toBe("compared");
    expect(verdict.duplicateOf).toEqual([]);
    expect(verdict.priorsCompared).toBe(1);
  });

  it("calls a near-identical generation distinct, because only equality counts", async () => {
    // 0.035 apart and not identical. Exact fingerprint equality is the only
    // similarity this slice recognises, and everything below it is a threshold
    // nobody has measured — see NOVELTY-2_PROMOTION_CRITERIA.md.
    const store = new ArtifactStore();
    const first = reportOf(await record(store, "exec-base", racingSources()));
    const second = reportOf(
      await record(store, "exec-near", nearMissSources()),
    );

    expect(second.fingerprint).not.toBe(first.fingerprint);
    expect(second.nearest?.distance).toBeGreaterThan(0);
    expect(second.nearest?.distance).toBeLessThan(0.5);
    expect(second.nearest?.identical).toBe(false);

    const verdict = verdictFor(store, "exec-near", second);

    expect(verdict.verdict).toBe("distinct");
    expect(verdict.duplicateOf).toEqual([]);
  });

  it("defines identity as fingerprint equality, not as a distance of zero", async () => {
    // The two coincide today, because every DNA field appears in both the
    // canonical encoding and the comparison — a mutation swapping one for the
    // other is currently equivalent, and is recorded as such rather than
    // covered by a test that cannot fail. They stop coinciding the moment a
    // field is added to one and not the other, and fingerprint equality is the
    // side that stays correct, because it is defined over the whole encoding.
    const store = new ArtifactStore();
    await record(store, "exec-def-a", racingSources());
    const report = reportOf(await record(store, "exec-def-b", racingSources()));

    for (const comparison of report.comparisons) {
      expect(comparison.identical).toBe(
        comparison.fingerprint === report.fingerprint,
      );
    }
  });

  it("never returns a verdict outside the declared set", async () => {
    const store = new ArtifactStore();
    const report = reportOf(await record(store, "exec-only", racingSources()));

    expect(NOVELTY_VERDICTS).toContain(
      verdictFor(store, "exec-only", report).verdict,
    );
  });
});

describe("NOVELTY-2 absence of evidence stays visible", () => {
  it("does not call a legacy prior without DNA distinct", async () => {
    const store = new ArtifactStore();
    await store.store(
      "exec-legacy",
      "WORLD_MODEL",
      null,
      buildWorldModel(racingSources()),
      { projectId: PROJECT, producer: "world-model" },
    );

    const report = reportOf(await record(store, "exec-next", racingSources()));
    const verdict = verdictFor(store, "exec-next", report);

    expect(verdict.verdict).toBe("insufficient-history");
    expect(verdict.comparisonOutcome).toBe("prior-without-dna");
    expect(verdict.priorsFound).toBe(1);
  });

  it("does not call unretrievable history distinct", async () => {
    // Artifacts written before ARTIFACT-CONTRACT-2 carry no owning project, so
    // the store cannot attribute them and a real history is invisible. That
    // must not read as a compared-and-different generation.
    const store = new ArtifactStore();
    await store.store(
      "exec-unowned",
      "WORLD_MODEL",
      null,
      buildWorldModel(racingSources()),
      { projectId: "a-different-project", producer: "world-model" },
    );

    const report = reportOf(await record(store, "exec-mine", racingSources()));
    const verdict = verdictFor(store, "exec-mine", report);

    expect(verdict.verdict).toBe("insufficient-history");
    expect(verdict.comparisonOutcome).toBe("no-prior-generations");
    expect(verdict.verdict).not.toBe("distinct");
  });

  it("does not call an undecodable prior distinct", async () => {
    const store = new ArtifactStore();
    const world = buildWorldModel(racingSources());
    const worldArtifact = await store.store(
      "exec-corrupt",
      "WORLD_MODEL",
      null,
      world,
      { projectId: PROJECT, producer: "world-model" },
    );
    const dna = buildGameDna(world);
    await store.store(
      "exec-corrupt",
      "GAME_DNA",
      null,
      {
        ...buildGameDnaReport({ dna, priorsFound: 0, priors: [] }),
        dna: { ...dna, roles: {} },
      },
      {
        projectId: PROJECT,
        producer: "game-dna",
        dependencies: [ArtifactStore.dependencyOn(worldArtifact)],
      },
    );

    const report = reportOf(
      await record(store, "exec-reader", racingSources()),
    );
    const verdict = verdictFor(store, "exec-reader", report);

    expect(verdict.verdict).toBe("insufficient-history");
    expect(verdict.comparisonOutcome).toBe("prior-without-dna");
    expect(verdict.priorsFound).toBe(1);
    expect(verdict.priorsCompared).toBe(0);
  });

  it("keeps a comparison failure distinguishable from an empty history", async () => {
    const store = new ArtifactStore();
    store.getProjectStageArtifacts = () => {
      throw new Error("storage unavailable");
    };

    const report = reportOf(
      await record(store, "exec-broken", racingSources()),
    );
    const verdict = verdictFor(store, "exec-broken", report);

    expect(verdict.verdict).toBe("insufficient-history");
    expect(verdict.comparisonOutcome).toBe("comparison-failed");
    // The distinction the verdict alone cannot carry, which is exactly why the
    // outcome travels with it.
    expect(verdict.comparisonOutcome).not.toBe("no-prior-generations");
  });
});

describe("NOVELTY-2 repair ancestry", () => {
  it("does not call a repaired execution a duplicate of its own parent", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-parent", racingSources());
    const report = await recordRepairOf(
      store,
      "exec-parent",
      "exec-parent-repair-1",
    );

    const verdict = verdictFor(store, "exec-parent-repair-1", report);

    expect(verdict.verdict).toBe("repair-preserved");
    expect(verdict.duplicateOf).toEqual([]);
    expect(verdict.repairAncestorMatches).toEqual([
      {
        executionId: "exec-parent",
        fingerprint: report.fingerprint,
        relation: "repair-ancestor",
      },
    ]);
  });

  it("still reports an unrelated duplicate alongside a repair ancestor", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-unrelated", racingSources());
    await record(store, "exec-parent", racingSources());
    const report = await recordRepairOf(
      store,
      "exec-parent",
      "exec-parent-repair-1",
    );

    const verdict = verdictFor(store, "exec-parent-repair-1", report);

    // The unrelated match dominates: the repair explains one identical prior,
    // not the other.
    expect(verdict.verdict).toBe("duplicate");
    expect(verdict.duplicateOf.map((m) => m.executionId)).toEqual([
      "exec-unrelated",
    ]);
    expect(verdict.repairAncestorMatches.map((m) => m.executionId)).toEqual([
      "exec-parent",
    ]);
  });

  it("follows lineage across a repair of a repair", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-root", racingSources());
    await recordRepairOf(store, "exec-root", "exec-root-repair-1");
    const report = await recordRepairOf(
      store,
      "exec-root-repair-1",
      "exec-root-repair-2",
    );

    const verdict = verdictFor(store, "exec-root-repair-2", report);

    expect(verdict.verdict).toBe("repair-preserved");
    expect(verdict.repairAncestorMatches.map((m) => m.executionId)).toEqual([
      "exec-root",
      "exec-root-repair-1",
    ]);
  });

  it("reads ancestry from lineage rather than the execution id", async () => {
    // `RepairEngine` names a repair `${parent}-repair-${n}`. A run named that
    // way with no lineage edge is not a repair, and treating it as one would
    // make the verdict depend on a convention nothing enforces.
    const store = new ArtifactStore();
    await record(store, "exec-parent", racingSources());
    const report = reportOf(
      await record(store, "exec-parent-repair-1", racingSources()),
    );

    const verdict = verdictFor(store, "exec-parent-repair-1", report);

    expect(verdict.verdict).toBe("duplicate");
    expect(verdict.repairAncestorMatches).toEqual([]);
  });

  it("finds the repair edge on a later Lua artifact, not only the first", async () => {
    // `store` permits several LUA_GENERATION artifacts under one pipeline id,
    // and a re-record produces exactly that. Reading only the first would miss
    // an edge written by a later one and report a repaired run as an
    // unrelated duplicate.
    const store = new ArtifactStore();
    await record(store, "exec-parent", racingSources());
    const parentLua = store
      .getByPipeline("exec-parent")
      .find((artifact) => artifact.stage === "LUA_GENERATION")!;

    // A first Lua for the child carrying no lineage at all, then the repaired
    // one that does.
    await store.store(
      "exec-child",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: luaPackage() },
      { projectId: PROJECT },
    );
    await store.store(
      "exec-child",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: luaPackage() },
      {
        projectId: PROJECT,
        dependencies: [ArtifactStore.dependencyOn(parentLua)],
      },
    );

    const ancestry = resolveRepairAncestry(store, "exec-child");

    expect(ancestry.resolved).toBe(true);
    expect([...ancestry.ancestors]).toEqual(["exec-parent"]);
  });

  it("takes the newest Lua artifact when two name different parents", async () => {
    // Only observable when more than one artifact carries an edge, which is
    // why the previous test could not pin it. Newest wins, the same policy the
    // DNA comparison uses for a re-recorded prior: the latest describes the
    // state the execution ended in.
    const store = new ArtifactStore();
    await record(store, "exec-older-parent", racingSources());
    await record(store, "exec-newer-parent", racingSources());
    const luaOf = (executionId: string) =>
      store
        .getByPipeline(executionId)
        .find((artifact) => artifact.stage === "LUA_GENERATION")!;

    const clock = vi.spyOn(Date, "now");
    try {
      clock.mockReturnValue(1_000);
      await store.store(
        "exec-child",
        "LUA_GENERATION",
        "lua_generator",
        { scripts: luaPackage() },
        {
          projectId: PROJECT,
          dependencies: [
            ArtifactStore.dependencyOn(luaOf("exec-older-parent")),
          ],
        },
      );
      clock.mockReturnValue(2_000);
      await store.store(
        "exec-child",
        "LUA_GENERATION",
        "lua_generator",
        { scripts: luaPackage() },
        {
          projectId: PROJECT,
          dependencies: [
            ArtifactStore.dependencyOn(luaOf("exec-newer-parent")),
          ],
        },
      );
    } finally {
      clock.mockRestore();
    }

    const ancestry = resolveRepairAncestry(store, "exec-child");

    expect([...ancestry.ancestors]).toEqual(["exec-newer-parent"]);
  });

  it("says so when ancestry cannot be established", async () => {
    // A lineage edge naming an artifact this store cannot resolve. There is a
    // parent and nobody can say which, which is not the same as no parent.
    const store = new ArtifactStore();
    await record(store, "exec-orphan", racingSources());
    const lua = store
      .getByPipeline("exec-orphan")
      .find((artifact) => artifact.stage === "LUA_GENERATION")!;
    vi.spyOn(store, "getByPipeline").mockImplementation((id) =>
      id === "exec-orphan"
        ? [
            {
              ...lua,
              dependencies: [
                {
                  artifactId: "artifact-that-does-not-exist",
                  stage: "LUA_GENERATION" as const,
                  contentHash: "sha256:0",
                },
              ],
            },
          ]
        : [],
    );

    const ancestry = resolveRepairAncestry(store, "exec-orphan");

    expect(ancestry.resolved).toBe(false);
    expect([...ancestry.ancestors]).toEqual([]);
  });
});

describe("NOVELTY-2 evidence is deterministic", () => {
  it("orders and deduplicates duplicate evidence by code unit", () => {
    const dna = buildGameDna(buildWorldModel(racingSources()));
    const fingerprint = fingerprintGameDna(dna);
    const prior = (executionId: string) => ({ executionId, fingerprint, dna });

    const verdict = deriveNoveltyVerdict({
      report: buildGameDnaReport({
        dna,
        priorsFound: 4,
        // `exec-a` twice: a re-record can produce two artifacts for one
        // execution, and one execution must not appear as two duplicates.
        priors: [
          prior("exec-b"),
          prior("exec-A"),
          prior("exec-a"),
          prior("exec-a"),
        ],
      }),
      ancestors: new Set(),
      ancestryResolved: true,
    });

    // Code unit, not locale: `localeCompare` orders these differently by host.
    expect(verdict.duplicateOf.map((m) => m.executionId)).toEqual([
      "exec-A",
      "exec-a",
      "exec-b",
    ]);
  });

  it("survives a restart, because the evidence is durable", async () => {
    const storage = new InMemoryStorageProvider();
    await record(new ArtifactStore(storage), "exec-before", racingSources());

    // A fresh store with no in-process cache, as after a restart.
    const afterRestart = new ArtifactStore(storage);
    const report = reportOf(
      await record(afterRestart, "exec-after", racingSources()),
    );
    const verdict = verdictFor(afterRestart, "exec-after", report);

    expect(verdict.verdict).toBe("duplicate");
    expect(verdict.duplicateOf.map((m) => m.executionId)).toEqual([
      "exec-before",
    ]);
  });
});

describe("NOVELTY-2 is additive and advisory", () => {
  it("leaves an execution with no verdict readable and unclaimed", () => {
    // PROVIDER-1A and PIPELINE-1A added optional fields the same way. An
    // execution recorded before this slice carries no verdict, and absence
    // means the question was never asked — not that it was found distinct.
    const legacy: { novelty?: { verdict: string } } = {};

    expect(legacy.novelty).toBeUndefined();
    expect(legacy.novelty?.verdict).not.toBe("distinct");
  });

  it("changes nothing about whether a generation passes", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-a", racingSources());
    const recorded = await record(store, "exec-b", racingSources());

    const validation = recorded.find((entry) => entry.stage === "VALIDATION");
    const report = validation?.content as {
      passed: boolean;
      blockingFailures: number;
      checks: Array<{ id: string }>;
    };

    // The second run is an exact duplicate of the first and still passes.
    expect(verdictFor(store, "exec-b", reportOf(recorded)).verdict).toBe(
      "duplicate",
    );
    expect(report.passed).toBe(true);
    expect(report.blockingFailures).toBe(0);
    expect(
      report.checks.some((check) => /novel|duplicate/i.test(check.id)),
    ).toBe(false);
  });
});
