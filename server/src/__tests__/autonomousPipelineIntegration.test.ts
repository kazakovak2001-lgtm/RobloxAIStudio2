/**
 * End-to-End Integration Tests — Autonomous Pipeline Real-Time Integration
 *
 * These tests verify the full integration of AutonomousOrchestrator with
 * PipelineEventEmitter, covering the complete event lifecycle, failure
 * propagation, agent name mapping, cost data, session lifecycle controls,
 * concurrent isolation, and reconnect resilience.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4, 3.5**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { AutonomousOrchestrator } from "../orchestrator/AutonomousOrchestrator";
import { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../execution/pipelineTypes";

// ─── Phase → Agent Name Mapping (from design.md) ───────────────────────────
const PHASE_AGENT_NAMES: Record<string, string> = {
  genre_detection: "Genre Detector",
  knowledge_search: "Knowledge Search",
  blueprint: "Blueprint Generator",
  agent_collaboration: "Agent Collaboration",
  lua_generation: "Lua Generator",
  asset_generation: "Asset Generator",
  experience_assembly: "Experience Assembler",
  playtest: "Playtest Runner",
  repair: "Repair Engine",
  benchmark: "Benchmark Analyzer",
  studio_sync: "Studio Sync",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function createSpyEmitter(): {
  emitter: PipelineEventEmitter;
  events: PipelineEvent[];
} {
  const events: PipelineEvent[] = [];
  const emitter = new PipelineEventEmitter();
  emitter.onEvent(async (event) => {
    events.push(event);
  });
  return { emitter, events };
}

async function waitForSessionEnd(
  orchestrator: AutonomousOrchestrator,
  sessionId: string,
  maxWaitMs = 15000,
): Promise<void> {
  const start = Date.now();
  let current = orchestrator.getSession(sessionId);
  while (
    current &&
    current.status === "running" &&
    Date.now() - start < maxWaitMs
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    current = orchestrator.getSession(sessionId);
  }
}

// ─── 1. Successful Pipeline Run ────────────────────────────────────────────

describe("Integration - Successful Pipeline Run", () => {
  it("property: full autonomous preview emits truthful phase evidence without production completion", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (prompt) => {
          const { emitter, events } = createSpyEmitter();
          const orchestrator = new AutonomousOrchestrator(emitter);
          const session = await orchestrator.run(prompt, "integration-test");

          // Wait for full pipeline completion
          await waitForSessionEnd(orchestrator, session.id);

          // Verify pipeline.started emitted
          const pipelineStarted = events.filter(
            (e) => e.type === "pipeline.started",
          );
          expect(pipelineStarted.length).toBe(1);
          expect(pipelineStarted[0].pipelineId).toBe(session.id);

          // Verify step.started events were emitted
          const stepStarted = events.filter((e) => e.type === "step.started");
          expect(stepStarted.length).toBeGreaterThan(0);

          const stepEvidence = events.filter(
            (e) => e.type === "step.completed" || e.type === "step.simulated",
          );
          expect(stepEvidence.length).toBeGreaterThan(0);

          const previewCompleted = events.filter(
            (e) => e.type === "pipeline.preview.completed",
          );
          const productionCompleted = events.filter(
            (e) => e.type === "pipeline.completed",
          );
          const pipelineFailed = events.filter(
            (e) => e.type === "pipeline.failed",
          );
          expect(previewCompleted.length + pipelineFailed.length).toBe(1);
          expect(productionCompleted.length).toBe(0);

          if (previewCompleted.length === 1) {
            const data = previewCompleted[0].data as Record<string, unknown>;
            expect(data).toMatchObject({
              executionMode: "bounded",
              resultAuthority: "preview-only",
              productionCompleted: false,
              qualityScore: expect.any(Number),
              totalCost: 0,
            });
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 2. Phase Failure Propagation ───────────────────────────────────────────

describe("Integration - Phase Failure Propagation", () => {
  it("property: pipeline with budget exceeded emits step.failed and pipeline.failed with failedStepId and failedAgentId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (prompt) => {
          const { emitter, events } = createSpyEmitter();
          const orchestrator = new AutonomousOrchestrator(emitter);

          // Use extremely low budget to trigger failure
          const session = await orchestrator.run(prompt, "failure-test", {
            maxCost: 0.0000001,
            timeLimitMs: 100,
          });

          // Wait for session to fail
          await waitForSessionEnd(orchestrator, session.id);

          const currentSession = orchestrator.getSession(session.id);

          // The session should have failed due to budget/time
          if (currentSession?.status === "failed") {
            // Verify step.failed was emitted
            const stepFailed = events.filter((e) => e.type === "step.failed");
            expect(stepFailed.length).toBeGreaterThan(0);

            // Verify step.failed has error message
            const failedData = stepFailed[0].data as Record<string, unknown>;
            expect(failedData.error).toBeDefined();
            expect(typeof failedData.error).toBe("string");

            // Verify pipeline.failed was emitted
            const pipelineFailed = events.filter(
              (e) => e.type === "pipeline.failed",
            );
            expect(pipelineFailed.length).toBe(1);

            // Verify pipeline.failed includes failedStepId and failedAgentId
            const pipelineFailedData = pipelineFailed[0].data as Record<
              string,
              unknown
            >;
            expect(pipelineFailedData.failedStepId).toBeDefined();
            expect(pipelineFailedData.failedAgentId).toBeDefined();
            expect(
              (pipelineFailedData.failedStepId as string).startsWith("auto-"),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 3. Agent Name Mapping ──────────────────────────────────────────────────

describe("Integration - Agent Name Mapping", () => {
  it("property: emitted step events use correct mapped names from PHASE_AGENT_NAMES", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (prompt) => {
          const { emitter, events } = createSpyEmitter();
          const orchestrator = new AutonomousOrchestrator(emitter);
          const session = await orchestrator.run(prompt, "name-mapping-test");

          // Wait for at least a few phases to complete
          await waitForSessionEnd(orchestrator, session.id);

          // Collect all step.started events
          const stepStarted = events.filter((e) => e.type === "step.started");
          expect(stepStarted.length).toBeGreaterThan(0);

          // Each step.started should have a data.name that is a mapped agent name
          const validAgentNames = Object.values(PHASE_AGENT_NAMES);
          for (const evt of stepStarted) {
            const data = evt.data as Record<string, unknown>;
            expect(data.name).toBeDefined();
            expect(validAgentNames).toContain(data.name);
            // Should NOT be a raw phase name like "genre_detection"
            expect(Object.keys(PHASE_AGENT_NAMES)).not.toContain(data.name);
          }

          // Verify stepId format uses auto- prefix
          for (const evt of stepStarted) {
            expect(evt.stepId).toBeDefined();
            expect(evt.stepId!.startsWith("auto-")).toBe(true);
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 4. Cost Data Propagation ───────────────────────────────────────────────

describe("Integration - Cost Data Propagation", () => {
  it("property: bounded step evidence includes zero billed usage with measured timing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (prompt) => {
          const { emitter, events } = createSpyEmitter();
          const orchestrator = new AutonomousOrchestrator(emitter);
          const session = await orchestrator.run(prompt, "cost-test");

          // Wait for completion
          await waitForSessionEnd(orchestrator, session.id);

          const stepEvidence = events.filter(
            (e) => e.type === "step.completed" || e.type === "step.simulated",
          );
          expect(stepEvidence.length).toBeGreaterThan(0);

          for (const evt of stepEvidence) {
            const data = evt.data as Record<string, unknown>;
            expect(data.output).toBeDefined();
            const output = data.output as Record<string, unknown>;
            expect(output.cost).toBeDefined();

            const costData = output.cost as Record<string, unknown>;
            expect(costData).toMatchObject({
              tokens: 0,
              cost: 0,
              source: "measured",
            });
            expect(typeof costData.timeMs).toBe("number");
            expect(costData.timeMs).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 5. Session Lifecycle ───────────────────────────────────────────────────

describe("Integration - Session Lifecycle", () => {
  it("property: start → pause stops event emission, resume resumes events, cancel terminates cleanly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (prompt) => {
          const { emitter, events } = createSpyEmitter();
          const orchestrator = new AutonomousOrchestrator(emitter);
          const session = await orchestrator.run(prompt, "lifecycle-test");

          // Verify pipeline.started was emitted
          expect(events.some((e) => e.type === "pipeline.started")).toBe(true);

          // Pause the session
          const paused = await orchestrator.pause(session.id);
          expect(paused).toBe(true);

          const pausedSession = orchestrator.getSession(session.id);
          expect(pausedSession!.status).toBe("paused");

          // Wait for any in-flight async event to settle, then snapshot
          await new Promise((resolve) => setTimeout(resolve, 150));
          const eventsAtPause = events.length;

          // Wait longer and confirm no NEW step.started events are emitted while paused
          await new Promise((resolve) => setTimeout(resolve, 400));
          const newStepStartedDuringPause = events
            .slice(eventsAtPause)
            .filter((e) => e.type === "step.started");
          expect(newStepStartedDuringPause.length).toBe(0);

          // Resume the session
          const resumed = await orchestrator.resume(session.id);
          expect(resumed).toBe(true);

          const resumedSession = orchestrator.getSession(session.id);
          expect(resumedSession!.status).toBe("running");

          // Wait for some events to arrive after resume
          await new Promise((resolve) => setTimeout(resolve, 600));
          const eventsAfterResume = events.length;
          expect(eventsAfterResume).toBeGreaterThan(eventsAtPause);

          // Cancel the session
          const cancelled = await orchestrator.cancel(session.id);
          // cancel may return false if session already completed
          if (cancelled) {
            const cancelledSession = orchestrator.getSession(session.id);
            expect(cancelledSession!.status).toBe("cancelled");
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 6. 404 Session Handling ────────────────────────────────────────────────

describe("Integration - 404 Session Handling", () => {
  it("property: getSession with non-existent ID returns null", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        async (nonExistentId) => {
          const orchestrator = new AutonomousOrchestrator();
          const result = orchestrator.getSession(nonExistentId);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 5 },
    );
  });

  it("property: getSession returns null for IDs that were never created (simulating 404 scenario)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (prompt, fakeId) => {
          const orchestrator = new AutonomousOrchestrator();
          // Create a real session
          const session = await orchestrator.run(prompt, "test-project");
          // Query with a fake ID - should return null (404 equivalent)
          const result = orchestrator.getSession(fakeId);
          expect(result).toBeNull();
          // Real session is still accessible
          const real = orchestrator.getSession(session.id);
          expect(real).not.toBeNull();
          expect(real!.id).toBe(session.id);
        },
      ),
      { numRuns: 5 },
    );
  });
});

// ─── 7. Concurrent Isolation ────────────────────────────────────────────────

describe("Integration - Concurrent Pipeline Isolation", () => {
  it("property: two separate autonomous sessions emit events with correct pipelineId, no cross-contamination", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt1, prompt2) => {
          const { emitter, events } = createSpyEmitter();
          const orchestrator = new AutonomousOrchestrator(emitter);

          // Start two concurrent sessions
          const session1 = await orchestrator.run(prompt1, "project-1");
          const session2 = await orchestrator.run(prompt2, "project-2");

          // IDs must be different
          expect(session1.id).not.toBe(session2.id);

          // Wait for both to complete
          await Promise.all([
            waitForSessionEnd(orchestrator, session1.id),
            waitForSessionEnd(orchestrator, session2.id),
          ]);

          // Partition events by pipelineId
          const session1Events = events.filter(
            (e) => e.pipelineId === session1.id,
          );
          const session2Events = events.filter(
            (e) => e.pipelineId === session2.id,
          );

          // Both sessions should have events
          expect(session1Events.length).toBeGreaterThan(0);
          expect(session2Events.length).toBeGreaterThan(0);

          // Verify no cross-contamination: all events belong to one of the two sessions
          for (const evt of events) {
            expect([session1.id, session2.id]).toContain(evt.pipelineId);
          }

          // Each session should have its own pipeline.started
          const s1Started = session1Events.filter(
            (e) => e.type === "pipeline.started",
          );
          const s2Started = session2Events.filter(
            (e) => e.type === "pipeline.started",
          );
          expect(s1Started.length).toBe(1);
          expect(s2Started.length).toBe(1);
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 8. Reconnect Resilience ────────────────────────────────────────────────

describe("Integration - Reconnect Resilience", () => {
  it("property: PipelineEventEmitter with handlers registered after orchestrator creation still receives events", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (prompt) => {
          const emitter = new PipelineEventEmitter();
          const orchestrator = new AutonomousOrchestrator(emitter);

          // Register handler AFTER orchestrator is created (simulates reconnect)
          const lateEvents: PipelineEvent[] = [];
          emitter.onEvent(async (event) => {
            lateEvents.push(event);
          });

          // Now run the pipeline
          const session = await orchestrator.run(prompt, "reconnect-test");

          // Wait for completion
          await waitForSessionEnd(orchestrator, session.id);

          // The late-registered handler should have received events
          expect(lateEvents.length).toBeGreaterThan(0);

          // Should include pipeline.started
          const hasPipelineStarted = lateEvents.some(
            (e) => e.type === "pipeline.started",
          );
          expect(hasPipelineStarted).toBe(true);

          // Should include step events
          const hasStepEvents = lateEvents.some(
            (e) => e.type === "step.started" || e.type === "step.completed",
          );
          expect(hasStepEvents).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});
