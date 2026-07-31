import { describe, expect, it } from "vitest";
import { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../types/pipeline-events";
import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import {
  AutonomousPhaseRegistry,
  createAutonomousPhaseContext,
  type AutonomousPhaseAdapter,
} from "./AutonomousPhaseRegistry";
import type { OrchestratorSession } from "./OrchestratorTypes";
import {
  InMemoryAutonomousSessionStore,
  type AutonomousSessionRecord,
} from "./store/AutonomousSessionStore";

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

describe("AutonomousOrchestrator bounded preview truthfulness", () => {
  it("executes bounded phase services and emits preview completion", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const orchestrator = new AutonomousOrchestrator(events);
    const session = await orchestrator.run(
      "Create a cooperative obby with checkpoints",
      "project-preview",
    );

    await waitForTerminal(session);

    expect(session.executionMode).toBe("bounded");
    expect(session.resultAuthority).toBe("preview-only");
    expect(session.status).toBe("preview_completed");
    expect(session.currentPhase).toBe("preview_completed");
    expect(session.qualityScore).toEqual(expect.any(Number));
    expect(session.qualityScore).toBeGreaterThanOrEqual(0);
    expect(session.qualityScore).toBeLessThanOrEqual(100);
    expect(session.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "measured",
    });

    const genre = session.phases.find(
      (phase) => phase.phase === "genre_detection",
    );
    expect(genre).toMatchObject({
      status: "completed",
      evidence: "heuristic",
      service: "PromptGenreHeuristic",
    });

    const lua = session.phases.find(
      (phase) => phase.phase === "lua_generation",
    );
    expect(lua).toMatchObject({
      status: "completed",
      evidence: "verified",
      capability: "available",
      service: "generation/lua/LuaGenerationEngine",
    });

    const playtest = session.phases.find((phase) => phase.phase === "playtest");
    expect(playtest).toMatchObject({
      status: "completed",
      evidence: "heuristic",
      capability: "degraded",
      service: "PlaytestEngine",
    });
    expect(playtest?.output).toMatchObject({
      overallScore: expect.any(Number),
      runtimeExecuted: false,
    });

    const repair = session.phases.find((phase) => phase.phase === "repair");
    expect(repair).toMatchObject({
      status: "skipped",
      capability: "unavailable",
      service: "RepairEngine",
    });
    expect(repair?.skippedReason).toContain("simulates score improvement");

    const studioSync = session.phases.find(
      (phase) => phase.phase === "studio_sync",
    );
    expect(studioSync).toMatchObject({
      status: "skipped",
      capability: "unavailable",
      service: "StudioBridgeServer",
    });
    expect(studioSync?.skippedReason).toContain("authenticated Studio session");

    expect(published.some((event) => event.type === "step.completed")).toBe(
      true,
    );
    expect(published.some((event) => event.type === "step.skipped")).toBe(true);
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
      executionMode: "bounded",
      resultAuthority: "preview-only",
      productionCompleted: false,
      qualityScore: expect.any(Number),
      totalCost: 0,
      unavailablePhases: 2,
    });
  });

  it("produces deterministic non-billable bounded evidence", async () => {
    const orchestrator = new AutonomousOrchestrator();

    const first = await orchestrator.run(
      "Build a horror survival game",
      "project-a",
    );
    const second = await orchestrator.run(
      "Build a horror survival game",
      "project-b",
    );

    await Promise.all([waitForTerminal(first), waitForTerminal(second)]);

    expect(first.genre).toBe("survival");
    expect(second.genre).toBe(first.genre);
    expect(first.qualityScore).toBe(second.qualityScore);
    expect(first.qualityScore).toEqual(expect.any(Number));
    expect(first.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "measured",
    });
    expect(second.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "measured",
    });
  });

  it("resumes an interrupted bounded run without duplicate terminal evidence", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const orchestrator = new AutonomousOrchestrator(events);
    const session = await orchestrator.run(
      "Build a cooperative obby with safe pause and resume",
      "project-race",
    );

    expect(await orchestrator.pause(session.id)).toBe(true);
    expect(await orchestrator.resume(session.id)).toBe(true);
    await waitForTerminal(session);

    expect(session.status).toBe("preview_completed");
    expect(
      published.filter((event) => event.type === "pipeline.preview.completed"),
    ).toHaveLength(1);

    const phaseTerminalEvents = published.filter(
      (event) =>
        event.type === "step.completed" || event.type === "step.skipped",
    );
    const terminalStepIds = phaseTerminalEvents.map((event) => event.stepId);
    expect(new Set(terminalStepIds).size).toBe(terminalStepIds.length);
    expect(session.checkpoints).toHaveLength(phaseTerminalEvents.length);
    expect(Object.keys(session.cost.perPhase)).toHaveLength(
      phaseTerminalEvents.length,
    );
  });

  it("recovers a restart before the first checkpoint from durable pre-phase state", async () => {
    const sessionStore = new InMemoryAutonomousSessionStore();
    const prompt = "Build a restart-safe obby";
    const startedAt = Date.now();
    const record: AutonomousSessionRecord = {
      session: {
        id: "orch-pre-checkpoint",
        projectId: "project-pre-checkpoint",
        prompt,
        executionMode: "bounded",
        resultAuthority: "preview-only",
        status: "running",
        currentPhase: "genre_detection",
        phases: [
          {
            id: "node-genre_detection",
            phase: "genre_detection",
            status: "running",
            startedAt,
          },
          {
            id: "node-preview-completed",
            phase: "preview_completed",
            status: "pending",
          },
        ],
        goals: {
          targetScore: 80,
          budget: 10000,
          timeLimitMs: 300000,
          maxCost: 1,
          maxRepairIterations: 3,
        },
        cost: {
          totalTokens: 0,
          totalCost: 0,
          totalTimeMs: 0,
          source: "measured",
          perPhase: {},
        },
        checkpoints: [],
        qualityScore: null,
        startedAt,
        recoveryCount: 0,
        executionGeneration: 0,
      },
      context: createAutonomousPhaseContext("project-pre-checkpoint", prompt),
      checkpointSequence: 0,
    };
    await sessionStore.save(record);

    const orchestrator = new AutonomousOrchestrator(undefined, {
      sessionStore,
      phaseRegistry: new AutonomousPhaseRegistry([]),
    });
    await orchestrator.ready();
    const session = orchestrator.getSession(record.session.id)!;

    expect(session).toMatchObject({
      status: "paused",
      recoveryReason: "server_restart",
      checkpoints: [],
    });
    expect(await orchestrator.recover(session.id)).toBe(true);
    await waitForTerminal(session);
    expect(session.status).toBe("preview_completed");
    expect(session.recoveryCount).toBe(1);
    expect(session.executionGeneration).toBe(1);
  });

  it("keeps bounded checkpoint cost snapshots isolated", async () => {
    const orchestrator = new AutonomousOrchestrator();
    const session = await orchestrator.run(
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

  it("rejects malformed checkpoint snapshots without corrupting session cost", async () => {
    const sessionStore = new InMemoryAutonomousSessionStore();
    const orchestrator = new AutonomousOrchestrator(undefined, {
      sessionStore,
    });
    const session = await orchestrator.run(
      "Build a checkpoint validation obby",
      "project-invalid-checkpoint",
    );

    await waitForTerminal(session);
    const checkpoint = session.checkpoints[0];
    const originalCost = session.cost;
    checkpoint.snapshot = {
      context: {
        projectId: session.projectId,
        prompt: session.prompt,
        systems: [],
      },
      phases: [],
      qualityScore: null,
    };
    const persisted = sessionStore.get(session.id)!;
    persisted.session.checkpoints[0].snapshot = checkpoint.snapshot;
    await sessionStore.save(persisted);

    expect(await orchestrator.recover(session.id, checkpoint.id)).toBe(false);
    expect(session.cost).toBe(originalCost);
    expect(session.status).toBe("preview_completed");
  });

  it("converts unexpected execution errors into a failed terminal session", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const failingAdapter: AutonomousPhaseAdapter = {
      phase: "genre_detection",
      capability() {
        throw new Error("Capability lookup failed");
      },
      async execute(context) {
        return {
          status: "completed",
          evidence: "heuristic",
          service: "FailingAdapter",
          output: {},
          context,
        };
      },
    };
    const orchestrator = new AutonomousOrchestrator(events, {
      phaseRegistry: new AutonomousPhaseRegistry([failingAdapter]),
    });
    const session = await orchestrator.run(
      "Build an error handling obby",
      "project-top-level-error",
    );

    await waitForTerminal(session);

    expect(session.status).toBe("failed");
    expect(session.currentPhase).toBe("failed");
    expect(published.some((event) => event.type === "pipeline.failed")).toBe(
      true,
    );
  });
});
