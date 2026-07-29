import { describe, expect, it } from "vitest";
import { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../types/pipeline-events";
import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import type { OrchestratorSession } from "./OrchestratorTypes";

async function waitForTerminal(
  session: OrchestratorSession,
): Promise<OrchestratorSession> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (session.status !== "running" && session.status !== "paused") {
      await Promise.resolve();
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Orchestrator session did not terminate: ${session.id}`);
}

describe("AutonomousOrchestrator preview truthfulness", () => {
  it("reports synthetic phases as simulated and emits preview completion", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const orchestrator = new AutonomousOrchestrator(events, {
      simulationDelayMs: 0,
    });
    const session = orchestrator.run(
      "Create a cooperative obby with checkpoints",
      "project-preview",
    );

    await waitForTerminal(session);

    expect(session.executionMode).toBe("simulation");
    expect(session.resultAuthority).toBe("preview-only");
    expect(session.status).toBe("simulated");
    expect(session.currentPhase).toBe("simulated");
    expect(session.qualityScore).toBeNull();
    expect(session.cost.totalTokens).toBe(0);
    expect(session.cost.totalCost).toBe(0);
    expect(session.cost.source).toBe("synthetic");

    const genre = session.phases.find(
      (phase) => phase.phase === "genre_detection",
    );
    expect(genre?.status).toBe("completed");
    expect(genre?.evidence).toBe("heuristic");

    const playtest = session.phases.find((phase) => phase.phase === "playtest");
    expect(playtest?.status).toBe("simulated");
    expect(playtest?.evidence).toBe("synthetic");
    expect(playtest?.output).toMatchObject({
      score: null,
      verification: "not-performed",
    });

    const repair = session.phases.find((phase) => phase.phase === "repair");
    expect(repair?.status).toBe("skipped");
    expect(repair?.skippedReason).toContain("No verified playtest score");

    const studioSync = session.phases.find(
      (phase) => phase.phase === "studio_sync",
    );
    expect(studioSync?.status).toBe("skipped");
    expect(studioSync?.skippedReason).toContain("Simulation mode");

    expect(published.some((event) => event.type === "step.simulated")).toBe(
      true,
    );
    expect(
      published.some((event) => event.type === "pipeline.preview.completed"),
    ).toBe(true);
    expect(published.some((event) => event.type === "pipeline.completed")).toBe(
      false,
    );

    const previewCompletion = published.find(
      (event) => event.type === "pipeline.preview.completed",
    );
    expect(previewCompletion?.data).toMatchObject({
      executionMode: "simulation",
      resultAuthority: "preview-only",
      productionCompleted: false,
      qualityScore: null,
      totalCost: 0,
    });
  });

  it("produces deterministic non-billable preview evidence", async () => {
    const orchestrator = new AutonomousOrchestrator(undefined, {
      simulationDelayMs: 0,
    });

    const first = orchestrator.run("Build a horror survival game", "project-a");
    const second = orchestrator.run(
      "Build a horror survival game",
      "project-b",
    );

    await Promise.all([waitForTerminal(first), waitForTerminal(second)]);

    expect(first.genre).toBe("survival");
    expect(second.genre).toBe(first.genre);
    expect(first.qualityScore).toBeNull();
    expect(second.qualityScore).toBeNull();
    expect(first.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "synthetic",
    });
    expect(second.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "synthetic",
    });
  });

  it("serializes rapid pause and resume without duplicate phase evidence", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const orchestrator = new AutonomousOrchestrator(events, {
      simulationDelayMs: 25,
    });
    const session = orchestrator.run(
      "Build a cooperative obby with safe pause and resume",
      "project-race",
    );

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (session.phases.some((phase) => phase.status === "running")) break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(orchestrator.pause(session.id)).toBe(true);
    expect(orchestrator.resume(session.id)).toBe(true);
    await waitForTerminal(session);

    const terminalEvents = published.filter(
      (event) => event.type === "pipeline.preview.completed",
    );
    expect(terminalEvents).toHaveLength(1);

    const phaseStarts = published.filter(
      (event) => event.type === "step.started",
    );
    const startedStepIds = phaseStarts.map((event) => event.stepId);
    expect(new Set(startedStepIds).size).toBe(startedStepIds.length);

    const phaseTerminalEvents = published.filter(
      (event) =>
        event.type === "step.completed" || event.type === "step.simulated",
    );
    const terminalStepIds = phaseTerminalEvents.map((event) => event.stepId);
    expect(new Set(terminalStepIds).size).toBe(terminalStepIds.length);
    expect(session.checkpoints).toHaveLength(phaseTerminalEvents.length);
    expect(Object.keys(session.cost.perPhase)).toHaveLength(
      phaseTerminalEvents.length,
    );
  });

  it("keeps checkpoint cost snapshots isolated from later phase costs", async () => {
    const orchestrator = new AutonomousOrchestrator(undefined, {
      simulationDelayMs: 0,
    });
    const session = orchestrator.run(
      "Build a deterministic tycoon preview",
      "project-checkpoint",
    );

    await waitForTerminal(session);

    const firstCheckpoint = session.checkpoints[0];
    const snapshotCost = firstCheckpoint.snapshot.cost as {
      perPhase: Record<string, unknown>;
    };

    expect(snapshotCost.perPhase).not.toBe(session.cost.perPhase);
    expect(Object.keys(snapshotCost.perPhase)).toEqual(["genre_detection"]);
    expect(Object.keys(session.cost.perPhase).length).toBeGreaterThan(1);
  });
});
