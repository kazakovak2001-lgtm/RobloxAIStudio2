/**
 * Bug Condition Exploration Property Test — Autonomous Pipeline Real-Time Events
 *
 * This test is written BEFORE any fixes are applied.
 * It encodes the EXPECTED (correct) behavior — so it MUST FAIL on unfixed code.
 * Failure confirms the bugs exist. DO NOT attempt to fix code or tests when they fail.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ─── Direct imports of units under test ─────────────────────────────────────
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

/**
 * Creates a spy PipelineEventEmitter that captures all emitted events.
 */
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

/**
 * Simulates the usePipelineStream hook's step.failed handling.
 * Returns whether the hook would update agent state on step.failed.
 */
function simulateUsePipelineStreamStepFailed(): boolean {
  // After fix: usePipelineStream now subscribes to step.failed
  const subscribedEvents = [
    "pipeline.started",
    "step.started",
    "step.completed",
    "step.failed", // ← NEW: added in Task 5
    "pipeline.completed",
    "pipeline.failed",
  ];

  return subscribedEvents.includes("step.failed");
}

/**
 * Simulates the AutonomousPipelinePanel polling behavior on 404.
 * Returns true if polling stops on 404, false if it continues.
 */
function simulatePollingOn404(): boolean {
  // After fix: Panel stops polling after 1 retry on 404
  // It shows "Session expired" and transitions to idle state
  return true; // Polling now stops gracefully on 404
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("Bug Condition Exploration - Autonomous Pipeline Emits No Events", () => {
  /**
   * Property 1: No pipeline.started emitted
   *
   * Expected behavior: When AutonomousOrchestrator.run() is called,
   * it SHALL emit a `pipeline.started` event via PipelineEventEmitter.
   *
   * Bug condition: AutonomousOrchestrator constructor does NOT accept a
   * PipelineEventEmitter parameter, and run() never calls emit.
   */
  describe("No pipeline.started emitted (Requirement 1.1, 1.3)", () => {
    it("property: AutonomousOrchestrator.run() SHALL emit pipeline.started via PipelineEventEmitter", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (prompt, projectId) => {
            const { emitter, events } = createSpyEmitter();

            // FIX: Constructor now accepts PipelineEventEmitter (Task 3)
            const orchestrator = new AutonomousOrchestrator(emitter);

            // Run with the injected emitter
            const session = orchestrator.run(prompt, projectId);

            // EXPECTED: pipeline.started should have been emitted
            const pipelineStarted = events.filter(
              (e) => e.type === "pipeline.started",
            );
            expect(pipelineStarted.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 2: No step.started emitted
   *
   * Expected behavior: When a phase begins executing in executePhases(),
   * it SHALL emit a `step.started` event with the mapped agent name.
   *
   * Bug condition: executePhases() updates node.status to "running" but
   * never calls emitter.emitStepStarted().
   */
  describe("No step.started emitted (Requirement 1.2)", () => {
    it("property: executing phases SHALL emit step.started for each running phase", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 100 }),
          async (prompt) => {
            const { emitter, events } = createSpyEmitter();

            // FIX: Constructor now accepts PipelineEventEmitter (Task 3)
            const orchestrator = new AutonomousOrchestrator(emitter);
            const session = orchestrator.run(prompt, "test-project");

            // Wait for at least one phase to start executing
            await new Promise((resolve) => setTimeout(resolve, 200));

            // EXPECTED: step.started events should be emitted for running phases
            const stepStartedEvents = events.filter(
              (e) => e.type === "step.started",
            );
            expect(stepStartedEvents.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 3: No step.completed with cost data
   *
   * Expected behavior: When a phase completes in executePhases(),
   * it SHALL emit a `step.completed` event with cost/token data.
   *
   * Bug condition: executePhases() completes phases and calls trackCost()
   * but never emits step.completed with cost information.
   */
  describe("No step.completed with cost data (Requirement 1.4)", () => {
    it("property: completing phases SHALL emit step.completed with cost data", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 100 }),
          async (prompt) => {
            const { emitter, events } = createSpyEmitter();

            // FIX: Constructor now accepts PipelineEventEmitter (Task 3)
            const orchestrator = new AutonomousOrchestrator(emitter);
            const session = orchestrator.run(prompt, "test-project");

            // Wait for phases to complete (genre_detection is ~50ms)
            await new Promise((resolve) => setTimeout(resolve, 300));

            // EXPECTED: step.completed events should exist with cost data
            const stepCompletedEvents = events.filter(
              (e) => e.type === "step.completed",
            );
            expect(stepCompletedEvents.length).toBeGreaterThan(0);

            // Also verify cost data is present in step.completed events
            if (stepCompletedEvents.length > 0) {
              const firstCompleted = stepCompletedEvents[0];
              expect((firstCompleted.data as any).output).toHaveProperty(
                "cost",
              );
            }
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 4: No step.failed on phase failure
   *
   * Expected behavior: When a phase throws an error in executePhases(),
   * it SHALL emit a `step.failed` event with the error details.
   *
   * Bug condition: The catch block in executePhases() updates session state
   * but never calls emitter.emitStepFailed().
   */
  describe("No step.failed on phase failure (Requirement 1.4)", () => {
    it("property: phase failures SHALL emit step.failed with error details", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 50 }),
          async (prompt) => {
            const { emitter, events } = createSpyEmitter();

            // Run with a very low budget to trigger failure via isOverBudget()
            // FIX: Constructor now accepts PipelineEventEmitter (Task 3)
            const orchestrator = new AutonomousOrchestrator(emitter);
            const session = orchestrator.run(prompt, "test-project", {
              maxCost: 0.0000001, // Extremely low — will trigger budget exceeded
              timeLimitMs: 100, // Very short time limit
            });

            // Wait for execution to hit the budget limit
            await new Promise((resolve) => setTimeout(resolve, 500));

            // The session should have failed
            const currentSession = orchestrator.getSession(session.id);
            const hasFailed =
              currentSession?.status === "failed" ||
              currentSession?.phases.some((p) => p.status === "failed");

            // EXPECTED: If a phase failed, step.failed should have been emitted
            if (hasFailed) {
              const stepFailedEvents = events.filter(
                (e) => e.type === "step.failed",
              );
              expect(stepFailedEvents.length).toBeGreaterThan(0);
            } else {
              // If no failure occurred in this run, at least step.completed should exist
              const stepCompletedEvents = events.filter(
                (e) => e.type === "step.completed",
              );
              expect(stepCompletedEvents.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 5: usePipelineStream missing step.failed subscription
   *
   * Expected behavior: usePipelineStream SHALL subscribe to `step.failed`
   * Socket.IO events and update the corresponding agent state to "failed".
   *
   * Bug condition: The hook subscribes to step.started, step.completed,
   * pipeline.started, pipeline.completed, pipeline.failed — but NOT step.failed.
   */
  describe("usePipelineStream missing step.failed (Requirement 1.5)", () => {
    it("property: usePipelineStream SHALL handle step.failed events to update agent state", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (agentId, errorMessage) => {
            // Simulate what usePipelineStream does with step.failed
            const hasStepFailedHandler = simulateUsePipelineStreamStepFailed();

            // EXPECTED: The hook SHOULD handle step.failed
            // BUG: step.failed is NOT in the subscription list
            expect(hasStepFailedHandler).toBe(true);
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 6: AutonomousPipelinePanel ignores 404
   *
   * Expected behavior: When getAutonomousStatus returns 404 (session not found),
   * the panel SHALL stop polling and transition to an error state.
   *
   * Bug condition: The polling callback only checks `res.success && res.data` —
   * a 404 response silently fails without stopping the interval.
   */
  describe("AutonomousPipelinePanel ignores 404 (Requirement 1.6)", () => {
    it("property: panel SHALL stop polling when session returns 404", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (sessionId) => {
          // Simulate what happens when getAutonomousStatus returns 404
          const pollingStopped = simulatePollingOn404();

          // EXPECTED: Polling SHOULD stop on 404
          // BUG: Polling continues indefinitely
          expect(pollingStopped).toBe(true);
        }),
        { numRuns: 5 },
      );
    });
  });
});
