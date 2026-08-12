import { describe, it, expect, vi } from "vitest";

import {
  PlaytestEngine,
  actionableFindingCount,
  countFindings,
  decodePlaytestReport,
  PLAYTEST_REPORT_SCHEMA_VERSION,
  type PlaytestInput,
  type PlaytestReport,
} from "../playtest";
import { RepairEngine } from "../repair/RepairEngine";
import { RepairExecutor } from "../repair/RepairExecutor";
import { InMemoryRepairSessionStore } from "../repair/RepairSessionStore";
import {
  DEFAULT_REPAIR_CONFIG,
  REPAIR_EVIDENCE_VERSION,
  type RepairSessionState,
} from "../repair/RepairTypes";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";

/**
 * PLAYTEST-TRUTH-1.
 *
 * The engine averaged six numbers into an `overallScore` and called anything
 * above eighty `production_ready`. One of the six added five points when the
 * source contained the substring `pcall`. Nothing here has ever run a Roblox
 * play session. These cover what the report may now claim, and what the repair
 * loop may now decide.
 */

const PROJECT = "playtest-truth-project";

function scripts(content: string) {
  return [
    {
      name: "Main",
      type: "ServerScript",
      path: "ServerScriptService/Main.server.lua",
      content,
      dependencies: [],
    },
  ];
}

function input(content = "print('hello')"): PlaytestInput {
  return { projectId: PROJECT, scripts: scripts(content), assets: [] };
}

describe("PLAYTEST-TRUTH-1 the report claims only what it knows", () => {
  it("makes no measured-quality claim from the old heuristic inputs", () => {
    // The exact inputs the removed heuristic rewarded: a `pcall` and a block
    // comment used to be worth ten points and could carry a report over the
    // `production_ready` line.
    const report = new PlaytestEngine().run(
      input("pcall(function() end)\n--[[ documented ]]"),
    );
    const asRecord = report as unknown as Record<string, unknown>;

    expect(asRecord.overallScore).toBeUndefined();
    expect(asRecord.classification).toBeUndefined();
    expect(asRecord.scores).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain("production_ready");
  });

  it("states that runtime was not measured rather than omitting it", () => {
    const report = new PlaytestEngine().run(input());

    expect(report.evidenceKind).toBe("static-analysis");
    expect(report.runtime.status).toBe("not-measured");
    expect(report.runtime.reason).toContain("No Roblox runtime play session");
    expect(report.summary).toContain("not measured");
  });

  it("keeps the deterministic findings, which are the useful part", () => {
    // A ModuleScript returning nothing is a real static defect and is still
    // reported. Removing the arithmetic removed no findings.
    const report = new PlaytestEngine().run({
      projectId: PROJECT,
      scripts: [
        {
          name: "Config",
          type: "ModuleScript",
          path: "ReplicatedStorage/Config.lua",
          content: "local Config = {}",
          dependencies: [],
        },
      ],
      assets: [],
    });

    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.findingCounts.total).toBe(report.issues.length);
    expect(report.systems.every((s) => s.counts.total >= 0)).toBe(true);
  });

  it("derives a system status from findings rather than a threshold", () => {
    const report = new PlaytestEngine().run(input());

    for (const system of report.systems) {
      const expected =
        system.counts.critical > 0
          ? "fail"
          : system.counts.warning > 0
            ? "warn"
            : "pass";
      expect(system.status).toBe(expected);
    }
  });

  it("counts an empty project's findings without inventing a grade", () => {
    const report = new PlaytestEngine().run({
      projectId: PROJECT,
      scripts: [],
      assets: [],
    });

    // The old engine returned 50 for the Lua sub-score of a project with no
    // scripts at all — a grade for something that does not exist.
    expect(report.runtime.status).toBe("not-measured");
    expect(report.findingCounts.total).toBe(report.issues.length);
  });
});

describe("PLAYTEST-TRUTH-1 legacy records stay legacy", () => {
  it("refuses to decode a legacy heuristic report as a measurement", () => {
    const legacy = {
      projectId: PROJECT,
      generatedAt: Date.now(),
      overallScore: 85,
      classification: "production_ready",
      scores: { lua: 90 },
      issues: [],
    };

    expect(decodePlaytestReport(legacy)).toBeNull();
  });

  it("refuses a report claiming a version or evidence kind it does not have", () => {
    const report = new PlaytestEngine().run(input());
    const round = (patch: Record<string, unknown>) =>
      decodePlaytestReport({ ...report, ...patch });

    expect(
      decodePlaytestReport(JSON.parse(JSON.stringify(report))),
    ).not.toBeNull();
    expect(round({ schemaVersion: 1 })).toBeNull();
    expect(round({ evidenceKind: "runtime-measurement" })).toBeNull();
    expect(round({ runtime: { status: "measured", reason: "x" } })).toBeNull();
    expect(round({ evidenceKind: undefined })).toBeNull();
  });

  it("keeps a legacy repair session readable without relabelling it", () => {
    // Rows written before this slice carry the heuristic totals. They stay
    // readable, and nothing reads them as measurements.
    const legacy = {
      projectId: PROJECT,
      status: "completed",
      currentIteration: 1,
      maxIterations: 5,
      targetScore: 80,
      currentScore: 85,
      history: [{ iteration: 1, scoreBefore: 70, scoreAfter: 85 }],
      startedAt: 0,
      totalRepairs: 1,
    } as unknown as RepairSessionState;

    expect(legacy.currentScore).toBe(85);
    // Absence of the evidence version is what marks it legacy.
    expect(legacy.evidenceVersion).toBeUndefined();
    expect(legacy.findingCounts).toBeUndefined();
  });
});

describe("PLAYTEST-TRUTH-1 repair decides on findings", () => {
  const BROKEN = [
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

  async function seed() {
    const registry = new AgentRegistry();
    const luaAgent = registry.getAgent("lua_generator");
    if (!luaAgent) throw new Error("lua_generator missing");
    const playable = await luaAgent.execute({
      blueprint: { name: "Truth Game", description: "baseline" },
      architecture: {},
      gameplay: {},
    });
    luaAgent.setLLM({
      generate: vi.fn().mockResolvedValue(JSON.stringify(playable.data)),
    });

    const repository = new InMemoryBlueprintRepository();
    await repository.createBlueprint("truth-user", {
      project_id: PROJECT,
      user_id: "truth-user",
      name: "Truth Game",
      description: "A blueprint used only to exercise repair semantics.",
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

    const store = new ArtifactStore();
    await store.store(
      "truth-exec",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: BROKEN },
      { projectId: PROJECT },
    );
    return { registry, repository, store };
  }

  it("never reports a session complete because a score was reached", async () => {
    const { registry, repository, store } = await seed();
    const session = await new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    ).run(PROJECT, "truth-exec", { maxIterations: 1, timeoutMs: 60_000 });

    // The old engine set status `completed` with the reason
    // "Target score reached" whenever the heuristic total cleared 80.
    expect(session.stopReason).not.toContain("Target score");
    expect(session.currentScore).toBeUndefined();
    expect(session.targetScore).toBeUndefined();
    expect(session.evidenceVersion).toBe(REPAIR_EVIDENCE_VERSION);
    expect(session.findingCounts).toBeDefined();
  }, 20000);

  it("stops truthfully when no actionable finding remains", async () => {
    const { registry, repository, store } = await seed();
    const session = await new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    ).run(PROJECT, "truth-exec", { maxIterations: 1, timeoutMs: 60_000 });

    if (actionableFindingCount(session.findingCounts) === 0) {
      expect(session.status).toBe("completed");
      expect(session.stopReason).toContain("No actionable");
    } else {
      expect(["stopped", "timeout"]).toContain(session.status);
    }
    // Whatever happened, the reason is stated rather than implied.
    expect(session.stopReason).toBeTruthy();
  }, 20000);

  it("performs no iteration when nothing is actionable", async () => {
    // The discriminating case for the loop condition. Every realistic input
    // produces at least a networking critical, so the clean state is stubbed:
    // with no actionable finding the loop body must never run, and a run that
    // iterated anyway would be repairing nothing.
    const { registry, repository, store } = await seed();
    const clean = new PlaytestEngine().run({
      projectId: PROJECT,
      scripts: [],
      assets: [],
    });
    const stub = vi.spyOn(PlaytestEngine.prototype, "run").mockReturnValue({
      ...clean,
      issues: [],
      findingCounts: {
        critical: 0,
        warning: 0,
        suggestion: 3,
        optimization: 0,
        total: 3,
      },
    });

    try {
      const session = await new RepairEngine(
        registry,
        repository,
        store,
        new InMemoryRepairSessionStore(),
      ).run(PROJECT, "truth-exec", { maxIterations: 5, timeoutMs: 60_000 });

      expect(session.currentIteration).toBe(0);
      expect(session.history).toHaveLength(0);
      expect(session.status).toBe("completed");
      expect(session.stopReason).toBe(
        "No actionable deterministic findings remain",
      );
    } finally {
      stub.mockRestore();
    }
  }, 20000);

  it("still terminates when findings never clear", async () => {
    // The other half: findings that never go away must not loop forever. The
    // attempt ceiling is what stops it, and it never depended on a score.
    const { registry, repository, store } = await seed();
    const stubborn = new PlaytestEngine().run({
      projectId: PROJECT,
      scripts: [],
      assets: [],
    });
    const stub = vi
      .spyOn(PlaytestEngine.prototype, "run")
      .mockReturnValue(stubborn);

    try {
      const session = await new RepairEngine(
        registry,
        repository,
        store,
        new InMemoryRepairSessionStore(),
      ).run(PROJECT, "truth-exec", { maxIterations: 100, timeoutMs: 60_000 });

      expect(session.currentIteration).toBeLessThanOrEqual(1);
      expect(session.finishedAt).toBeDefined();
      expect(session.stopReason).toBeTruthy();
    } finally {
      stub.mockRestore();
    }
  }, 20000);

  it("is bounded by the attempt ceiling even when repairs always apply", async () => {
    // The strongest form of the no-infinite-loop requirement. Findings never
    // clear and every repair reports as applied, so neither the findings
    // condition nor the no-repairs break can end the run. Only the attempt
    // ceiling can, and it never depended on a score.
    const { registry, repository, store } = await seed();
    const stubborn = new PlaytestEngine().run({
      projectId: PROJECT,
      scripts: [],
      assets: [],
    });
    const engineStub = vi
      .spyOn(PlaytestEngine.prototype, "run")
      .mockReturnValue(stubborn);
    const executorStub = vi
      .spyOn(RepairExecutor.prototype, "execute")
      .mockImplementation(async (_plan, context) => ({
        results: [
          {
            issueId: "always",
            strategy: "regenerate_script" as const,
            applied: true,
            artifactChanged: "ServerScriptService/World.server.lua",
            detail: "stubbed as applied",
          },
        ],
        scripts: context.scripts,
      }));

    try {
      const session = await new RepairEngine(
        registry,
        repository,
        store,
        new InMemoryRepairSessionStore(),
      ).run(PROJECT, "truth-exec", { maxIterations: 1000, timeoutMs: 60_000 });

      expect(session.currentIteration).toBe(1);
      expect(session.stopReason).toContain("Bounded repair attempt limit");
      expect(session.finishedAt).toBeDefined();
    } finally {
      executorStub.mockRestore();
      engineStub.mockRestore();
    }
  }, 20000);

  it("terminates on the attempt ceiling with no score to stop it", async () => {
    // The ceiling never depended on the score, which is why removing the
    // target cannot make this loop unbounded.
    const { registry, repository, store } = await seed();
    const session = await new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    ).run(PROJECT, "truth-exec", {
      maxIterations: 50,
      timeoutMs: 60_000,
    });

    expect(session.currentIteration).toBeLessThanOrEqual(1);
    expect(["completed", "stopped", "timeout"]).toContain(session.status);
    expect(session.finishedAt).toBeDefined();
  }, 20000);

  it("records findings before and after, never a score delta", async () => {
    const { registry, repository, store } = await seed();
    const session = await new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    ).run(PROJECT, "truth-exec", { maxIterations: 1, timeoutMs: 60_000 });

    for (const record of session.history) {
      expect(record.scoreBefore).toBeUndefined();
      expect(record.scoreAfter).toBeUndefined();
      expect(record.findingsBefore).toBeDefined();
      expect(record.findingsAfter).toBeDefined();
    }
  }, 20000);

  it("does not read an unchanged finding set as an improvement", async () => {
    const { registry, repository, store } = await seed();
    const session = await new RepairEngine(
      registry,
      repository,
      store,
      new InMemoryRepairSessionStore(),
    ).run(PROJECT, "truth-exec", { maxIterations: 1, timeoutMs: 60_000 });

    for (const record of session.history) {
      if (record.repairsApplied === 0) {
        // Nothing applied means nothing resolved, whatever any number did.
        expect(record.findingsAfter).toEqual(record.findingsBefore);
      }
    }
  }, 20000);

  it("keeps the config's target score inert", () => {
    // Callers still pass it. It decides nothing.
    expect(
      (DEFAULT_REPAIR_CONFIG as { targetScore?: number }).targetScore,
    ).toBeUndefined();
  });
});

describe("PLAYTEST-TRUTH-1 counting helpers", () => {
  it("counts by severity and totals them", () => {
    const counts = countFindings([
      { severity: "critical" },
      { severity: "critical" },
      { severity: "warning" },
      { severity: "suggestion" },
      { severity: "optimization" },
    ] as PlaytestReport["issues"]);

    expect(counts).toEqual({
      critical: 2,
      warning: 1,
      suggestion: 1,
      optimization: 1,
      total: 5,
    });
  });

  it("treats only criticals and warnings as actionable", () => {
    // Advice is not outstanding work. Counting it would keep a repair loop
    // running with nothing left to fix.
    expect(
      actionableFindingCount({
        critical: 0,
        warning: 0,
        suggestion: 9,
        optimization: 9,
        total: 18,
      }),
    ).toBe(0);
    expect(
      actionableFindingCount({
        critical: 1,
        warning: 2,
        suggestion: 0,
        optimization: 0,
        total: 3,
      }),
    ).toBe(3);
  });

  it("pins the report schema version", () => {
    expect(new PlaytestEngine().run(input()).schemaVersion).toBe(
      PLAYTEST_REPORT_SCHEMA_VERSION,
    );
  });
});
