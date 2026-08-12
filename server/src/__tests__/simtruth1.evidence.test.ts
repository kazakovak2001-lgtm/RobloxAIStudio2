import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { GameSimulationEngine } from "../simulation/core/GameSimulationEngine";
import {
  PlaytestAgent,
  SIMULATION_EVIDENCE_VERSION,
  decodeSimulationEvidenceReport,
  type SimulationEvidenceReport,
} from "../simulation/agents/PlaytestAgent";
import { GameplayMetricsEngine } from "../simulation/metrics/GameplayMetricsEngine";
import {
  REGENERATION_POLICY_ID,
  SimulationFeedbackEngine,
} from "../simulation/feedback/SimulationFeedbackEngine";
import {
  GameHealthMonitor,
  isAssessed,
} from "../lifecycle/monitor/GameHealthMonitor";
import { createLifecycleRouter } from "../routes/lifecycle";
import type { ProjectAccessControl } from "../routes/projects";

/**
 * SIM-TRUTH-1.
 *
 * `PlaytestAgent` reported `engagementScore`, a 0–100 number named after player
 * engagement and produced by weighting four values from a tick-driven script.
 * Two of the four were the same quantity counted twice, one was initialised to
 * `true`, and a blueprint with no NPCs scored full marks for interacting with
 * nothing. `/lifecycle/tick` substituted `?? 70` for every missing signal, so a
 * game nothing had ever looked at was assessed healthy and sent down an
 * evolution branch. These cover what may now be claimed, and what may not.
 */

const PROJECT = "sim-truth-project";

function blueprint(mechanics: number, npcs: number) {
  return {
    id: PROJECT,
    mechanics: Array.from({ length: mechanics }, (_, i) => `mech-${i}`),
    npcs: Array.from({ length: npcs }, (_, i) => ({ id: `npc-${i}` })),
  } as never;
}

function run(mechanics: number, npcs: number): SimulationEvidenceReport {
  const bp = blueprint(mechanics, npcs);
  const simulation = new GameSimulationEngine().simulateGame(bp);
  return new PlaytestAgent().analyze(bp, simulation);
}

function feedbackFor(mechanics: number, npcs: number) {
  const bp = blueprint(mechanics, npcs);
  const simulation = new GameSimulationEngine().simulateGame(bp);
  const report = new PlaytestAgent().analyze(bp, simulation);
  const metrics = new GameplayMetricsEngine().extract(simulation);
  return new SimulationFeedbackEngine().generateFeedback(report, metrics);
}

describe("SIM-TRUTH-1 the report claims only what the simulation saw", () => {
  it("states its evidence kind and that no player was observed", () => {
    const report = run(4, 4);
    expect(report.schemaVersion).toBe(SIMULATION_EVIDENCE_VERSION);
    expect(report.evidenceKind).toBe("deterministic-simulation");
    expect(report.player.status).toBe("not-observed");
    expect(report.player.reason).toMatch(/no Roblox runtime ran/i);
  });

  it("exposes no aggregate engagement score under any name", () => {
    // The defect was an aggregate presented as a measurement. Nothing may
    // replace it, including a renamed or rescaled version.
    const report = run(4, 4) as unknown as Record<string, unknown>;
    for (const forbidden of [
      "engagementScore",
      "engagement",
      "overallScore",
      "score",
      "grade",
      "rating",
      "loopCompletionRate",
    ]) {
      expect(report[forbidden]).toBeUndefined();
    }
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/engagementScore/);
    expect(serialized).not.toMatch(/"grade"/);
  });

  it("keeps the raw deterministic observations available", () => {
    const report = run(4, 3);
    expect(report.observed).toMatchObject({
      mechanicsDeclared: 4,
      npcsDeclared: 3,
    });
    expect(report.observed.totalTicks).toBeGreaterThan(0);
    expect(typeof report.observed.loopCompleteEventEmitted).toBe("boolean");
    expect(report.observed.currencyGainEvents).toBeGreaterThan(0);
    // Observations are counts, not ratios dressed as measurements.
    expect(report.observed.mechanicsExercised).toBe(4);
  });

  it("separates observed facts from derived ratios", () => {
    const report = run(4, 4);
    expect(report.derived.mechanicReach.exercised).toBe(
      report.observed.mechanicsExercised,
    );
    expect(report.derived.mechanicReach.ofDeclared).toBe(1);
    expect(report.derived.npcReach.ofDeclared).toBe(1);
  });
});

describe("SIM-TRUTH-1 simulator artifacts are not game defects", () => {
  it("records that the stride, not the blueprint, capped mechanic reach", () => {
    // Mechanics are visited on a stride of three, so a blueprint declaring
    // three can only ever have one indexed.
    const report = run(3, 4);
    expect(report.derived.mechanicReach.declared).toBe(3);
    expect(report.derived.mechanicReach.reachable).toBe(1);
    expect(report.derived.mechanicReach.scheduleLimited).toBe(true);
    // Everything the schedule could reach was reached.
    expect(report.derived.mechanicReach.ofReachable).toBe(1);
  });

  it("does not assert a broken loop against a blueprint the stride cannot cover", () => {
    const report = run(3, 4);
    const brokenLoop = report.findings.filter(
      (f) => f.category === "broken-loop",
    );
    expect(brokenLoop).toHaveLength(1);
    expect(brokenLoop[0].attribution).toBe("simulator-schedule");
    expect(brokenLoop[0].description).toMatch(/stride could not reach/i);
    // The advice aimed at the game is withheld when the game is not the cause.
    expect(report.suggestions).not.toContain(
      "Simplify the core loop or add more discovery paths",
    );
  });

  it("does not blame the blueprint when the stride capped NPC reach", () => {
    // Five NPCs on a stride of five: exactly one is reachable, so the old
    // "Only 20% of NPCs were interacted with" was caused by this loop. The
    // shortfall is still reported — dropping it would hide something real —
    // but never against the blueprint.
    const report = run(4, 5);
    expect(report.derived.npcReach.declared).toBe(5);
    expect(report.derived.npcReach.reachable).toBe(1);
    expect(report.derived.npcReach.scheduleLimited).toBe(true);
    expect(report.derived.npcReach.ofReachable).toBe(1);
    const deadEnd = report.findings.filter((f) => f.category === "dead-end");
    expect(deadEnd).toHaveLength(1);
    expect(deadEnd[0].attribution).toBe("simulator-schedule");
  });

  it("gives every finding an attribution", () => {
    for (const [m, n] of [
      [4, 4],
      [3, 5],
      [0, 0],
      [9, 10],
    ] as Array<[number, number]>) {
      for (const finding of run(m, n).findings) {
        expect(["blueprint", "simulator-schedule", "indeterminate"]).toContain(
          finding.attribution,
        );
      }
    }
  });

  it("does not award interaction credit when there are no NPCs", () => {
    // The old rule scored `npcRate = 1` for a blueprint with no NPCs, worth a
    // sixth of the removed score. Absent is not success.
    const report = run(4, 0);
    expect(report.observed.npcsDeclared).toBe(0);
    expect(report.observed.npcsInteracted).toBe(0);
    expect(report.derived.npcReach.ofDeclared).toBeNull();
    expect(report.derived.npcReach.ofReachable).toBeNull();
    expect(report.derived.npcReach.scheduleLimited).toBe(false);
  });
});

describe("SIM-TRUTH-1 metrics leave unanswered questions unanswered", () => {
  it("reports no progression ratio when no currency was gained", () => {
    const simulation = new GameSimulationEngine().simulateGame(blueprint(4, 4));
    const metrics = new GameplayMetricsEngine().extract({
      ...simulation,
      events: simulation.events.filter((e) => e.type !== "currency_gain"),
    });
    // The old code substituted a bare 50 here.
    expect(metrics.economyProgressionRatio).toBeNull();
  });

  it("exposes no economyStability or completionRate restatements", () => {
    const simulation = new GameSimulationEngine().simulateGame(blueprint(4, 4));
    const metrics = new GameplayMetricsEngine().extract(
      simulation,
    ) as unknown as Record<string, unknown>;
    expect(metrics.economyStability).toBeUndefined();
    expect(metrics.completionRate).toBeUndefined();
    expect(metrics.loopEngagementScore).toBeUndefined();
  });
});

describe("SIM-TRUTH-1 regeneration is decided by named policy", () => {
  it("names the policy and the evidence on every decision", () => {
    for (const [m, n] of [
      [4, 4],
      [3, 4],
      [0, 0],
    ] as Array<[number, number]>) {
      const decision = feedbackFor(m, n).decision;
      expect(decision.policyId).toBe(REGENERATION_POLICY_ID);
      expect(decision.reason.length).toBeGreaterThan(0);
      expect(["regenerate", "no-action", "abstain"]).toContain(
        decision.outcome,
      );
    }
  });

  it("regenerates on a blueprint that declares nothing, naming it as the cause", () => {
    // The old engine graded this run `D` and returned shouldRegenerate false,
    // which reads as "checked, and acceptable". Declaring no mechanics is a
    // property of the blueprint and real evidence about it, so the policy acts
    // on it rather than abstaining.
    const feedback = feedbackFor(0, 0);
    expect(feedback.decision.outcome).toBe("regenerate");
    expect(feedback.decision.evidenceUsed.join(" ")).toMatch(
      /declares no mechanics/i,
    );
    expect(feedback.shouldRegenerate).toBe(true);
  });

  it("abstains when the run exercised nothing the blueprint declared", () => {
    // Evidence about the simulation, not about the game: no conclusion may be
    // drawn either way.
    const bp = blueprint(2, 2);
    const simulation = new GameSimulationEngine().simulateGame(bp, 0);
    const report = new PlaytestAgent().analyze(bp, simulation);
    const metrics = new GameplayMetricsEngine().extract(simulation);
    const feedback = new SimulationFeedbackEngine().generateFeedback(
      report,
      metrics,
    );
    expect(feedback.decision.outcome).toBe("abstain");
    expect(feedback.decision.reason).toMatch(/exercised none/i);
    expect(feedback.shouldRegenerate).toBe(false);
    expect(feedback.summary).toMatch(/abstain/);
  });

  it("never regenerates on a finding the simulator caused", () => {
    // Three mechanics: the loop cannot complete, but the stride is the reason.
    const feedback = feedbackFor(3, 4);
    expect(
      feedback.items.some((i) => i.attribution === "simulator-schedule"),
    ).toBe(true);
    expect(feedback.decision.outcome).not.toBe("regenerate");
    // No schedule-caused finding may appear among the evidence a regenerate
    // decision would have cited.
    expect(feedback.decision.evidenceUsed.some((e) => /stride/i.test(e))).toBe(
      false,
    );
  });

  it("exposes no letter grade", () => {
    const feedback = feedbackFor(4, 4) as unknown as Record<string, unknown>;
    expect(feedback.overallGrade).toBeUndefined();
    expect(JSON.stringify(feedback)).not.toMatch(/"overallGrade"/);
  });
});

describe("SIM-TRUTH-1 health is withheld without evidence", () => {
  it("returns insufficient-evidence instead of a fabricated pass", () => {
    const monitor = new GameHealthMonitor();
    const assessment = monitor.assess(PROJECT, {
      simulationEvidence: null,
      economyHealth: null,
      worldStability: null,
      anomalyRate: null,
    });
    expect(assessment.status).toBe("insufficient-evidence");
    expect(isAssessed(assessment)).toBe(false);
    const serialized = JSON.stringify(assessment);
    // The exact figures the `?? 70` defaults used to produce.
    expect(serialized).not.toMatch(/"composite":\s*73/);
    expect(serialized).not.toMatch(/retentionSimulated/);
    expect(serialized).not.toMatch(/"trend":\s*"stable"/);
  });

  it("names every missing signal", () => {
    const monitor = new GameHealthMonitor();
    const assessment = monitor.assess(PROJECT, {
      simulationEvidence: null,
      economyHealth: 80,
      worldStability: null,
      anomalyRate: 5,
    });
    if (isAssessed(assessment)) throw new Error("should not have assessed");
    expect(assessment.missing).toEqual([
      "simulationEvidence",
      "worldStability",
    ]);
    expect(assessment.reason).toMatch(/not a passing result/i);
  });

  it("does not record an insufficient result as a trend baseline", () => {
    const monitor = new GameHealthMonitor();
    monitor.assess(PROJECT, {
      simulationEvidence: null,
      economyHealth: null,
      worldStability: null,
      anomalyRate: null,
    });
    expect(monitor.getLatest(PROJECT)).toBeNull();
    expect(monitor.needsIntervention(PROJECT)).toBe(false);
  });

  it("reports no trend on a first assessment", () => {
    const monitor = new GameHealthMonitor();
    const first = monitor.assess(PROJECT, {
      simulationEvidence: 80,
      economyHealth: 80,
      worldStability: 80,
      anomalyRate: 10,
    });
    if (!isAssessed(first)) throw new Error("should have assessed");
    // The old monitor said "stable" with nothing to compare against.
    expect(first.trend).toBeNull();
    expect(first.weights).toBeDefined();

    const second = monitor.assess(PROJECT, {
      simulationEvidence: 80,
      economyHealth: 80,
      worldStability: 80,
      anomalyRate: 10,
    });
    if (!isAssessed(second)) throw new Error("should have assessed");
    expect(second.trend).toBe("stable");
  });
});

describe("SIM-TRUTH-1 lifecycle separates client claims from evidence", () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>(
      (resolve) => server?.close(() => resolve()) ?? resolve(),
    );
    server = undefined;
  });

  async function tick(body: unknown) {
    const access: ProjectAccessControl = {
      getRequestUserId: async () => "user",
      requireAuthenticatedUser: async () => "user",
      requireProjectAccess: async () => true,
    };
    const app = express();
    app.use(express.json());
    app.use("/lifecycle", createLifecycleRouter(access));
    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/lifecycle/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as {
      success: boolean;
      data: Record<string, unknown>;
    };
  }

  it("does not turn a client-supplied engagement score into server health", async () => {
    const result = await tick({
      gameId: PROJECT,
      blueprint: { id: PROJECT, mechanics: [], npcs: [] },
      // A caller asserting a perfect game.
      simulationData: { engagementScore: 100 },
    });

    const health = result.data.health as Record<string, unknown>;
    expect(health.status).toBe("insufficient-evidence");
    expect((health.signals as Record<string, unknown>).simulationEvidence).toBe(
      null,
    );
    // The claim is echoed as a claim, never promoted.
    const claims = result.data.clientClaims as Record<string, unknown>;
    expect(claims.simulation).toMatchObject({ engagementScore: 100 });
    // Assert on the signals rather than the serialized text: `timestamp`
    // renders milliseconds, so a substring check for "100" fails whenever the
    // clock lands on .100.
    expect(health.signals).toEqual({
      simulationEvidence: null,
      economyHealth: null,
      worldStability: null,
      anomalyRate: null,
    });
    expect(health.composite).toBeUndefined();
  });

  it("fabricates no health from absent evidence", async () => {
    const result = await tick({
      gameId: PROJECT,
      blueprint: { id: PROJECT, mechanics: [], npcs: [] },
    });
    const serialized = JSON.stringify(result.data.health);
    expect(serialized).not.toMatch(/"composite":\s*7[0-9]/);
    expect(serialized).not.toMatch(/retentionSimulated/);
    expect(result.data.health).toMatchObject({
      status: "insufficient-evidence",
    });
  });

  it("abstains from evolution instead of evolving on a default", async () => {
    // The old path fed a fabricated 73 into evolve(), which selected the
    // "optimize" branch and applied patches to the blueprint.
    const result = await tick({
      gameId: PROJECT,
      blueprint: { id: PROJECT, mechanics: [], npcs: [] },
    });
    expect(result.data.evolution).toMatchObject({
      ran: false,
      abstained: true,
    });
    expect((result.data.evolution as Record<string, unknown>).reason).toMatch(
      /not produced|Absent evidence/i,
    );
    expect(result.data.feedback).toBeNull();
  });
});

describe("SIM-TRUTH-1 review follow-up", () => {
  it("refuses a legacy scored report instead of throwing on it", () => {
    // The pre-slice shape: `issues`, an `engagementScore`, no `findings`.
    // Reaching the feedback engine, it threw a TypeError; accepting it would
    // promote a number that never measured anything.
    const legacy = {
      blueprintId: PROJECT,
      issues: [],
      engagementScore: 87,
      loopCompletionRate: 1,
      mechanicsCoverage: 1,
      npcInteractionRate: 1,
      suggestions: [],
    };
    expect(decodeSimulationEvidenceReport(legacy)).toBeNull();
  });

  it("decodes a report it produced and refuses altered versions", () => {
    const report = JSON.parse(JSON.stringify(run(4, 4)));
    expect(decodeSimulationEvidenceReport(report)).not.toBeNull();
    expect(
      decodeSimulationEvidenceReport({ ...report, schemaVersion: 99 }),
    ).toBeNull();
    expect(
      decodeSimulationEvidenceReport({
        ...report,
        evidenceKind: "runtime-measurement",
      }),
    ).toBeNull();
    // A report claiming a player was observed is not this evidence kind.
    expect(
      decodeSimulationEvidenceReport({
        ...report,
        player: { status: "observed", reason: "x" },
      }),
    ).toBeNull();
  });

  it.each([
    "observed",
    "derived",
    "player",
    "findings",
    "suggestions",
    "blueprintId",
  ])("refuses a report missing %s", (field) => {
    const report = JSON.parse(JSON.stringify(run(4, 4)));
    delete report[field];
    expect(decodeSimulationEvidenceReport(report)).toBeNull();
  });

  it("refuses a finding whose cause is unstated", () => {
    const report = JSON.parse(JSON.stringify(run(3, 4)));
    expect(report.findings.length).toBeGreaterThan(0);
    delete report.findings[0].attribution;
    expect(decodeSimulationEvidenceReport(report)).toBeNull();
  });

  it("counts a zero-tick run as zero ticks and reaches nothing", () => {
    // A run of no ticks used to report one tick, which made the schedule claim
    // the first mechanic was reachable and blamed the blueprint for the loop.
    const bp = blueprint(1, 1);
    const simulation = new GameSimulationEngine().simulateGame(bp, 0);
    expect(simulation.totalTicks).toBe(0);
    expect(simulation.schedule.mechanicsReachable).toBe(0);
    expect(simulation.schedule.npcsReachable).toBe(0);

    const report = new PlaytestAgent().analyze(bp, simulation);
    const brokenLoop = report.findings.find(
      (f) => f.category === "broken-loop",
    );
    expect(brokenLoop?.attribution).toBe("simulator-schedule");

    const metrics = new GameplayMetricsEngine().extract(simulation);
    const feedback = new SimulationFeedbackEngine().generateFeedback(
      report,
      metrics,
    );
    // Nothing ran, so nothing may be concluded about the blueprint.
    expect(feedback.decision.outcome).not.toBe("regenerate");
  });

  it("attributes a blueprint that declares no mechanics to the blueprint", () => {
    // The stride reached everything there was to reach, so the simulator is
    // not the cause and must not be named as one.
    const report = run(0, 2);
    const brokenLoop = report.findings.find(
      (f) => f.category === "broken-loop",
    );
    expect(brokenLoop?.attribution).toBe("blueprint");
    expect(brokenLoop?.description).toMatch(/declares no mechanics/i);
    for (const friction of report.findings.filter(
      (f) => f.category === "friction",
    )) {
      expect(friction.attribution).toBe("blueprint");
    }
  });

  it("still reports an NPC shortfall, attributed to the schedule", () => {
    // The rule must not be dead: five NPCs on a stride of five leaves four
    // unreached, and a reader should see that with its cause named.
    const report = run(4, 5);
    const deadEnd = report.findings.find((f) => f.category === "dead-end");
    expect(deadEnd).toBeDefined();
    expect(deadEnd?.attribution).toBe("simulator-schedule");
    expect(deadEnd?.description).toMatch(/this simulator's scheduling/i);
    expect(report.suggestions).not.toContain(
      "Place NPCs closer to player paths or add quest markers",
    );
  });

  it("does not let duplicate mechanic names understate reach", () => {
    const bp = {
      id: PROJECT,
      mechanics: ["mine", "mine", "trade", "build"],
      npcs: [],
    } as never;
    const simulation = new GameSimulationEngine().simulateGame(bp);
    const report = new PlaytestAgent().analyze(bp, simulation);
    // Three distinct mechanics are declared and all three are reachable, so no
    // broken-loop finding may be raised against the blueprint.
    expect(report.derived.mechanicReach.declared).toBe(3);
    expect(report.derived.mechanicReach.reachable).toBe(3);
    expect(report.derived.mechanicReach.exercised).toBe(3);
    expect(report.findings.some((f) => f.category === "broken-loop")).toBe(
      false,
    );
  });
});
