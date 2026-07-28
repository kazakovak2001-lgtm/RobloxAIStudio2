import { describe, expect, it } from "vitest";
import { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../types/pipeline-events";
import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import type { OrchestratorSession } from "./OrchestratorTypes";

async function waitForTerminal(
  session: OrchestratorSession,
): Promise<OrchestratorSession> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
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
    const session = orchestrator.run(
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

    const first = orchestrator.run("Build a horror survival game", "project-a");
    const second = orchestrator.run(
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
});
