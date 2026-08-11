import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

import {
  buildGameDna,
  buildGameDnaReport,
  compareGameDna,
  encodeGameDna,
  fingerprintGameDna,
  DNA_COMPARISON_OUTCOMES,
  GAME_DNA_SCHEMA_VERSION,
  MAX_RECORDED_COMPARISONS,
  type GameDnaReport,
} from "../validation/gameDna";
import { buildWorldModel, type WorldModel } from "../validation/worldModel";
import { GenerationArtifactRecorder } from "../studio/artifacts/GenerationArtifactRecorder";
import { ArtifactStore } from "../pipeline/v2";
import {
  ARTIFACT_DEPENDENCY_RULES,
  canonicalJson,
  DETERMINISTIC_PRODUCERS,
} from "../pipeline/v2/artifactEnvelope";
import { STAGE_AGENT_MAP, STAGE_ORDER } from "../pipeline/v2/PipelineStage";
import type { PlayableLuaScript } from "../types/playableLua";
import type { TaskNode } from "../planning/model/TaskGraph";

/**
 * NOVELTY-1 — GameDNA and structural similarity fingerprint.
 *
 * The platform already had a diversity mechanism that compared the *seed* it
 * invented for itself before any agent ran. These cover the first thing that
 * compares one generation's structure to another's, and the states it reports
 * when it cannot.
 */

const PROJECT = "novelty-1-test-project";

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

function dnaReportOf(
  artifacts: Awaited<ReturnType<typeof record>>,
): GameDnaReport {
  const artifact = artifacts.find((entry) => entry.stage === "GAME_DNA");
  if (!artifact) throw new Error("no GAME_DNA artifact recorded");
  return artifact.content as GameDnaReport;
}

describe("NOVELTY-1 the fingerprint describes structure", () => {
  it("is stable across repeated derivation of the same world", () => {
    const world = buildWorldModel(racingSources());

    expect(fingerprintGameDna(buildGameDna(world))).toBe(
      fingerprintGameDna(buildGameDna(world)),
    );
  });

  it("does not move when only the order of the model's arrays changes", () => {
    // The world model's arrays carry no meaning in their order — the same
    // services listed the other way round are the same game, and a digest
    // that disagreed would report a rename as a new design.
    const world = buildWorldModel(racingSources());
    const reversed: WorldModel = {
      ...world,
      systems: [...world.systems].reverse(),
      entities: [...world.entities].reverse(),
      relationships: [...world.relationships].reverse(),
      constraints: [...world.constraints].reverse(),
      dependencies: [...world.dependencies].reverse(),
    };

    expect(fingerprintGameDna(buildGameDna(reversed))).toBe(
      fingerprintGameDna(buildGameDna(world)),
    );
  });

  it("separates two structurally different games", () => {
    const racing = buildGameDna(buildWorldModel(racingSources()));
    const puzzle = buildGameDna(buildWorldModel(puzzleSources()));

    expect(fingerprintGameDna(racing)).not.toBe(fingerprintGameDna(puzzle));
    expect(compareGameDna(racing, puzzle).distance).toBeGreaterThan(0);
  });

  it("ignores what a system is called and reads what it does", () => {
    // Renaming every service must not read as a different game, because the
    // roles and the graph shape are what the model actually verified.
    const renamed = {
      ...racingSources(),
      architecture: {
        architecture: {
          services: {
            RespawnService: "Places racers on the grid",
            SaveService: "Persists best lap times",
            NetworkService: "Broadcasts lap and placement changes",
          },
          apiContracts: {
            "Circuit.SectorDone": { input: "lap", output: "times" },
          },
        },
      },
    };

    expect(fingerprintGameDna(buildGameDna(buildWorldModel(renamed)))).toBe(
      fingerprintGameDna(buildGameDna(buildWorldModel(racingSources()))),
    );
  });

  it("fingerprints progression and scoring by presence, not by wording", () => {
    // The world model holds these as one sentence each. Digesting the sentence
    // would move on a reword and hold still on a redesign.
    const reworded = {
      ...racingSources(),
      gameDesign: {
        gameplay: {
          ...racingSources().gameDesign.gameplay,
          balance: {
            ...racingSources().gameDesign.gameplay.balance,
            economyOrScoring: "Placement points derived from lap times",
          },
          progression: { player_progression_model: "Placing unlocks tracks" },
        },
      },
    };
    const dropped = {
      ...racingSources(),
      gameDesign: {
        gameplay: {
          mechanics: racingSources().gameDesign.gameplay.mechanics,
          balance: {
            winCondition: "Cross the finish line first",
            loseCondition: "Fail to finish before the timer expires",
          },
        },
      },
    };

    const base = buildGameDna(buildWorldModel(racingSources()));
    // Pinned absolutely, not just against each other: two derived values that
    // are both wrong agree perfectly.
    expect(base.declares).toEqual({ progression: true, scoring: true });
    expect(buildGameDna(buildWorldModel(reworded)).declares).toEqual({
      progression: true,
      scoring: true,
    });
    expect(buildGameDna(buildWorldModel(dropped)).declares).toEqual({
      progression: false,
      scoring: false,
    });
  });

  it("does not fingerprint a dependency graph that is always a star", () => {
    // `buildWorldModel` has a single `dependencies.push` site: every
    // progress-signal system requires the one `presentation` system. So node
    // and edge counts are a function of the role distribution, and a graph
    // component over them would be three fields carrying nothing new. If this
    // fails, the model grew real edges and the component should come back.
    const world = buildWorldModel(racingSources());
    const targets = new Set(
      world.dependencies.flatMap((dependency) => dependency.requires),
    );

    expect([...targets]).toEqual(["presentation"]);
    expect(world.dependencies).toHaveLength(
      world.systems.filter((system) => system.role === "progress-signal")
        .length,
    );
    expect(encodeGameDna(buildGameDna(world))).not.toContain("dependency");
  });

  it("encodes exactly what it claims to encode", () => {
    // The encoding is the readable statement of what is inside the digest.
    // Pinned so a field cannot be dropped from it while the type still shows.
    const encoded = encodeGameDna(
      buildGameDna(buildWorldModel(racingSources())),
    );
    const keys = encoded.split("\n").map((line) => line.split("=")[0]);

    expect(keys).toContain("schemaVersion");
    expect(keys).toContain("count.systems");
    expect(keys).toContain("count.entities");
    expect(keys).toContain("declares.progression");
    expect(keys).toContain("declares.scoring");
    expect(keys.filter((key) => key.startsWith("role."))).toHaveLength(7);
    expect(keys.filter((key) => key.startsWith("relation."))).toHaveLength(5);
    expect(keys.filter((key) => key.startsWith("constraint."))).toHaveLength(4);
    // Sorted, so the encoding cannot depend on object insertion order.
    expect([...keys].sort()).toEqual(
      [...keys].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
  });

  it("hashes the way ARTIFACT-CONTRACT-2 hashes a string payload", () => {
    // The construction is duplicated to keep the validation layer free of a
    // pipeline dependency. Pinned against the real one so they cannot drift.
    const dna = buildGameDna(buildWorldModel(racingSources()));
    const encoded = encodeGameDna(dna);
    const viaPipeline = createHash("sha256")
      .update(canonicalJson(encoded), "utf8")
      .digest("hex");

    expect(fingerprintGameDna(dna)).toBe(`sha256:${viaPipeline}`);
  });
});

describe("NOVELTY-1 the comparison", () => {
  it("is symmetric", () => {
    const racing = buildGameDna(buildWorldModel(racingSources()));
    const puzzle = buildGameDna(buildWorldModel(puzzleSources()));

    expect(compareGameDna(racing, puzzle).distance).toBe(
      compareGameDna(puzzle, racing).distance,
    );
  });

  it("reports zero distance and every component for an identical pair", () => {
    const dna = buildGameDna(buildWorldModel(racingSources()));
    const result = compareGameDna(dna, dna);

    expect(result.distance).toBe(0);
    expect(result.components.every((part) => part.distance === 0)).toBe(true);
    // Every component reports, including the ones that agree. A comparison
    // that listed only differences could not be told from one that ran fewer
    // checks.
    expect(result.components).toHaveLength(7);
  });

  it("keeps every component within its normalized range", () => {
    const result = compareGameDna(
      buildGameDna(buildWorldModel(racingSources())),
      buildGameDna(buildWorldModel(puzzleSources())),
    );

    for (const part of result.components) {
      expect(part.distance).toBeGreaterThanOrEqual(0);
      expect(part.distance).toBeLessThanOrEqual(1);
    }
    expect(result.distance).toBeLessThanOrEqual(1);
  });
});

describe("NOVELTY-1 absence of a comparison is never novelty", () => {
  it("says a first generation is uncompared, not new", async () => {
    const report = dnaReportOf(
      await record(new ArtifactStore(), "exec-first", racingSources()),
    );

    expect(report.outcome).toBe("no-prior-generations");
    expect(report.priorsFound).toBe(0);
    expect(report.priorsCompared).toBe(0);
    expect(report.comparisons).toEqual([]);
    expect(report.nearest).toBeUndefined();
  });

  it("distinguishes prior generations that carry no DNA", async () => {
    // The real state of every existing project the moment this ships: world
    // models exist, DNA artifacts do not. Reporting that as "no history" would
    // erase generations that happened.
    const store = new ArtifactStore();
    const world = buildWorldModel(racingSources());
    await store.store("exec-legacy", "WORLD_MODEL", null, world, {
      projectId: PROJECT,
      producer: "world-model",
    });

    const report = dnaReportOf(
      await record(store, "exec-next", racingSources()),
    );

    expect(report.outcome).toBe("prior-without-dna");
    expect(report.priorsFound).toBe(1);
    expect(report.priorsCompared).toBe(0);
  });

  it("never reports an outcome outside the declared set", async () => {
    const report = dnaReportOf(
      await record(new ArtifactStore(), "exec-only", racingSources()),
    );

    expect(DNA_COMPARISON_OUTCOMES).toContain(report.outcome);
  });
});

describe("NOVELTY-1 comparison against prior generations", () => {
  it("compares a repeat generation against the one before it", async () => {
    const store = new ArtifactStore();
    const first = dnaReportOf(await record(store, "exec-1", racingSources()));
    const second = dnaReportOf(await record(store, "exec-2", racingSources()));

    expect(second.outcome).toBe("compared");
    expect(second.priorsFound).toBe(1);
    expect(second.priorsCompared).toBe(1);
    expect(second.nearest?.executionId).toBe("exec-1");
    // The same design generated twice is the same structure, and saying so is
    // the whole point — the seed-based engine could not.
    expect(second.nearest?.distance).toBe(0);
    expect(second.nearest?.identical).toBe(true);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("reports a structurally different generation as distant", async () => {
    const store = new ArtifactStore();
    await record(store, "exec-racing", racingSources());
    const puzzle = dnaReportOf(
      await record(store, "exec-puzzle", puzzleSources()),
    );

    expect(puzzle.outcome).toBe("compared");
    expect(puzzle.nearest?.distance).toBeGreaterThan(0);
    expect(puzzle.nearest?.identical).toBe(false);
  });

  it("does not compare a generation against itself", async () => {
    // Reachable on a re-record of the same execution, which is what repair
    // does. Seeded directly so the filter is exercised rather than merely
    // present: on a first pass nothing of this execution is stored yet, so a
    // missing filter would look correct.
    const store = new ArtifactStore();
    const world = buildWorldModel(racingSources());
    await store.store("exec-solo", "WORLD_MODEL", null, world, {
      projectId: PROJECT,
      producer: "world-model",
    });
    await store.store(
      "exec-solo",
      "GAME_DNA",
      null,
      buildGameDnaReport({
        dna: buildGameDna(world),
        priorsFound: 0,
        priors: [],
      }),
      { projectId: PROJECT, producer: "game-dna" },
    );

    const report = dnaReportOf(
      await record(store, "exec-solo", racingSources()),
    );

    expect(report.priorsFound).toBe(0);
    expect(report.outcome).toBe("no-prior-generations");
    expect(
      report.comparisons.some((entry) => entry.executionId === "exec-solo"),
    ).toBe(false);
  });

  it("does not reach across projects", async () => {
    // There is no cross-project index, and inventing one by ignoring the
    // owning project would compare unrelated games.
    const store = new ArtifactStore();
    await record(store, "exec-other", racingSources(), "a-different-project");
    const report = dnaReportOf(
      await record(store, "exec-mine", racingSources()),
    );

    expect(report.outcome).toBe("no-prior-generations");
    expect(report.priorsFound).toBe(0);
  });

  it("orders comparisons nearest first and states the untruncated total", async () => {
    const store = new ArtifactStore();
    for (let index = 0; index < MAX_RECORDED_COMPARISONS + 2; index++) {
      await record(store, `exec-prior-${index}`, racingSources());
    }
    const report = dnaReportOf(
      await record(store, "exec-last", puzzleSources()),
    );

    expect(report.comparisons).toHaveLength(MAX_RECORDED_COMPARISONS);
    // The cap is not silent: the real total is recorded beside the short list.
    expect(report.priorsCompared).toBe(MAX_RECORDED_COMPARISONS + 2);
    expect(report.priorsFound).toBe(MAX_RECORDED_COMPARISONS + 2);
    const distances = report.comparisons.map((entry) => entry.distance);
    expect([...distances].sort((left, right) => left - right)).toEqual(
      distances,
    );
  });

  it("orders equal distances by code unit, not by locale", async () => {
    // `localeCompare` orders byte-identical ids differently on hosts with
    // different locales, which SECURITY-REVIEW-A2 had to correct once already.
    const dna = buildGameDna(buildWorldModel(racingSources()));
    const prior = (executionId: string) => ({
      executionId,
      fingerprint: fingerprintGameDna(dna),
      dna,
    });
    const report = buildGameDnaReport({
      dna,
      priorsFound: 3,
      priors: [prior("exec-b"), prior("exec-A"), prior("exec-a")],
    });

    expect(report.comparisons.map((entry) => entry.executionId)).toEqual([
      "exec-A",
      "exec-a",
      "exec-b",
    ]);
  });
});

describe("NOVELTY-1 the artifact", () => {
  it("carries lineage on the world model it was derived from", async () => {
    const store = new ArtifactStore();
    const recorded = await record(store, "exec-lineage", racingSources());

    const dna = recorded.find((entry) => entry.stage === "GAME_DNA");
    const world = recorded.find((entry) => entry.stage === "WORLD_MODEL");

    expect(dna?.name).toBe("gameDna.json");
    expect(dna?.agent).toBeNull();
    expect(dna?.producer).toEqual({
      type: "deterministic",
      id: "game-dna",
      version: DETERMINISTIC_PRODUCERS["game-dna"],
    });
    expect(dna?.dependencies).toHaveLength(1);
    expect(dna?.dependencies?.[0]?.artifactId).toBe(world?.id);
    expect(dna?.dependencies?.[0]?.contentHash).toBe(world?.contentHash);
  });

  it("declares only the dependency it actually has", () => {
    expect(ARTIFACT_DEPENDENCY_RULES.GAME_DNA).toEqual(["WORLD_MODEL"]);
  });

  it("is agentless and ordered after the model it reads", () => {
    expect(STAGE_AGENT_MAP.GAME_DNA).toBeNull();
    expect(STAGE_ORDER.indexOf("GAME_DNA")).toBeGreaterThan(
      STAGE_ORDER.indexOf("WORLD_MODEL"),
    );
  });

  it("keeps the fingerprint out of the comparison", async () => {
    // Two generations of the same design have different reports — the second
    // carries a comparison — but must fingerprint identically, or the digest
    // measures history instead of structure.
    const store = new ArtifactStore();
    const first = await record(store, "exec-fp-1", racingSources());
    const second = await record(store, "exec-fp-2", racingSources());

    expect(dnaReportOf(second).fingerprint).toBe(
      dnaReportOf(first).fingerprint,
    );
    // And the artifacts themselves differ, because the reports differ.
    const hashOf = (artifacts: Awaited<ReturnType<typeof record>>) =>
      artifacts.find((entry) => entry.stage === "GAME_DNA")?.contentHash;
    expect(hashOf(second)).not.toBe(hashOf(first));
  });

  it("records the schema version it was written under", async () => {
    const report = dnaReportOf(
      await record(new ArtifactStore(), "exec-version", racingSources()),
    );

    expect(report.schemaVersion).toBe(GAME_DNA_SCHEMA_VERSION);
    expect(report.dna.schemaVersion).toBe(GAME_DNA_SCHEMA_VERSION);
  });
});

describe("NOVELTY-1 changes nothing about whether a generation passes", () => {
  it("leaves validation blocking-free and the package recorded", async () => {
    const recorded = await record(
      new ArtifactStore(),
      "exec-advisory",
      racingSources(),
    );

    const validation = recorded.find((entry) => entry.stage === "VALIDATION");
    const report = validation?.content as {
      passed: boolean;
      blockingFailures: number;
      checks: Array<{ id: string }>;
    };

    expect(report.passed).toBe(true);
    expect(report.blockingFailures).toBe(0);
    // Nothing in the validation report reads the DNA. Similarity is not a
    // check in this slice, and NOVELTY-2 is where a gate would live.
    expect(report.checks.some((check) => /dna|novel/i.test(check.id))).toBe(
      false,
    );
    expect(recorded.some((entry) => entry.stage === "LUA_GENERATION")).toBe(
      true,
    );
  });
});
