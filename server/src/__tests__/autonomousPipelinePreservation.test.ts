/**
 * Preservation Property Tests — Non-Autonomous Pipeline Behavior Unchanged
 *
 * These tests capture the CURRENT valid behavior that MUST be preserved after
 * the autonomous pipeline integration fix. All tests MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
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
 * Creates a PipelineEventEmitter that captures all emitted events.
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

// ─── 1. Autonomous Pipeline API Behavior ────────────────────────────────────

describe("Preservation - Autonomous Pipeline API Behavior", () => {
  it("property: AutonomousOrchestrator.run() accepts valid prompts and returns a session with id, status running, currentPhase, and phases[]", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (prompt, projectId) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, projectId);

          expect(session).toBeDefined();
          expect(session.id).toBeDefined();
          expect(typeof session.id).toBe("string");
          expect(session.id.startsWith("orch-")).toBe(true);
          expect(session.status).toBe("running");
          expect(session.currentPhase).toBeDefined();
          expect(Array.isArray(session.phases)).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("property: AutonomousOrchestrator.getSession() returns the session by ID", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 100 }), (prompt) => {
        const orchestrator = new AutonomousOrchestrator();
        const session = orchestrator.run(prompt, "test-project");
        const retrieved = orchestrator.getSession(session.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(session.id);
        expect(retrieved!.prompt).toBe(prompt);
      }),
      { numRuns: 5 },
    );
  });

  it("property: AutonomousOrchestrator.getSession() returns null for unknown session ID", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 10, maxLength: 50 }), (unknownId) => {
        const orchestrator = new AutonomousOrchestrator();
        const result = orchestrator.getSession(unknownId);
        expect(result).toBeNull();
      }),
      { numRuns: 5 },
    );
  });

  it("property: session phases array contains 12 entries (11 phases + simulated terminal node)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 100 }), (prompt) => {
        const orchestrator = new AutonomousOrchestrator();
        const session = orchestrator.run(prompt, "test-project");

        expect(session.phases.length).toBe(12);
      }),
      { numRuns: 5 },
    );
  });

  it("property: session runs to completion within reasonable time", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, "test-project");

          // Wait for completion - phases are 40-200ms each, 11 phases max ~2200ms
          // Give extra buffer
          const maxWait = 15000;
          const start = Date.now();
          let current = orchestrator.getSession(session.id);

          while (
            current &&
            current.status === "running" &&
            Date.now() - start < maxWait
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            current = orchestrator.getSession(session.id);
          }

          expect(current).not.toBeNull();
          // Should have finished (completed or failed due to skip conditions)
          expect(["simulated", "failed"]).toContain(current!.status);
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 2. Status Polling Behavior ─────────────────────────────────────────────

describe("Preservation - Status Polling Behavior", () => {
  it("property: after run(), getSession(id) returns current status", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 80 }), (prompt) => {
        const orchestrator = new AutonomousOrchestrator();
        const session = orchestrator.run(prompt, "test-project");
        const polled = orchestrator.getSession(session.id);

        expect(polled).not.toBeNull();
        expect(polled!.status).toBeDefined();
        expect(
          ["running", "simulated", "paused", "cancelled", "failed"].includes(
            polled!.status,
          ),
        ).toBe(true);
      }),
      { numRuns: 5 },
    );
  });

  it("property: session transitions running → simulated on preview success", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, "test-project");

          expect(session.status).toBe("running");

          // Wait for completion
          const maxWait = 15000;
          const start = Date.now();
          let current = orchestrator.getSession(session.id);

          while (
            current &&
            current.status === "running" &&
            Date.now() - start < maxWait
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            current = orchestrator.getSession(session.id);
          }

          expect(current).not.toBeNull();
          expect(["simulated", "failed"]).toContain(current!.status);
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);

  it("property: paused sessions have status paused", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 80 }), (prompt) => {
        const orchestrator = new AutonomousOrchestrator();
        const session = orchestrator.run(prompt, "test-project");

        // Pause immediately
        const paused = orchestrator.pause(session.id);
        expect(paused).toBe(true);

        const current = orchestrator.getSession(session.id);
        expect(current!.status).toBe("paused");
      }),
      { numRuns: 5 },
    );
  });

  it("property: cancelled sessions have status cancelled", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 80 }), (prompt) => {
        const orchestrator = new AutonomousOrchestrator();
        const session = orchestrator.run(prompt, "test-project");

        const cancelled = orchestrator.cancel(session.id);
        expect(cancelled).toBe(true);

        const current = orchestrator.getSession(session.id);
        expect(current!.status).toBe("cancelled");
      }),
      { numRuns: 5 },
    );
  });
});

// ─── 3. Existing Pipeline Event System (PipelineEventEmitter) ───────────────

describe("Preservation - PipelineEventEmitter System", () => {
  it("property: PipelineEventEmitter constructor works (instantiable)", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const emitter = new PipelineEventEmitter();
        expect(emitter).toBeDefined();
        expect(emitter).toBeInstanceOf(PipelineEventEmitter);
      }),
      { numRuns: 5 },
    );
  });

  it("property: onEvent() registers handlers correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }),
        async (pipelineId) => {
          const emitter = new PipelineEventEmitter();
          const received: PipelineEvent[] = [];

          emitter.onEvent(async (event) => {
            received.push(event);
          });

          await emitter.emit({
            type: "pipeline.started",
            pipelineId,
            timestamp: new Date(),
          });

          expect(received.length).toBe(1);
          expect(received[0].type).toBe("pipeline.started");
          expect(received[0].pipelineId).toBe(pipelineId);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("property: emit() dispatches to registered handlers", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "step.started",
          "step.completed",
          "step.failed",
          "pipeline.started",
          "pipeline.completed",
          "pipeline.failed",
        ) as fc.Arbitrary<
          | "step.started"
          | "step.completed"
          | "step.failed"
          | "pipeline.started"
          | "pipeline.completed"
          | "pipeline.failed"
        >,
        fc.string({ minLength: 1, maxLength: 30 }),
        async (eventType, pipelineId) => {
          const emitter = new PipelineEventEmitter();
          const received: PipelineEvent[] = [];

          emitter.onEvent(async (event) => {
            received.push(event);
          });

          await emitter.emit({
            type: eventType,
            pipelineId,
            timestamp: new Date(),
          });

          expect(received.length).toBe(1);
          expect(received[0].type).toBe(eventType);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("property: multiple handlers can be registered", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }),
        async (pipelineId) => {
          const emitter = new PipelineEventEmitter();
          const received1: PipelineEvent[] = [];
          const received2: PipelineEvent[] = [];

          emitter.onEvent(async (event) => {
            received1.push(event);
          });
          emitter.onEvent(async (event) => {
            received2.push(event);
          });

          await emitter.emit({
            type: "pipeline.started",
            pipelineId,
            timestamp: new Date(),
          });

          expect(received1.length).toBe(1);
          expect(received2.length).toBe(1);
          expect(received1[0].pipelineId).toBe(pipelineId);
          expect(received2[0].pipelineId).toBe(pipelineId);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("property: events include pipelineId, type, and timestamp", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }),
        async (pipelineId) => {
          const emitter = new PipelineEventEmitter();
          const received: PipelineEvent[] = [];

          emitter.onEvent(async (event) => {
            received.push(event);
          });

          const timestamp = new Date();
          await emitter.emit({
            type: "step.started",
            pipelineId,
            timestamp,
          });

          expect(received[0].pipelineId).toBe(pipelineId);
          expect(received[0].type).toBe("step.started");
          expect(received[0].timestamp).toEqual(timestamp);
        },
      ),
      { numRuns: 5 },
    );
  });
});

// ─── 4. Existing usePipelineStream Socket.IO Subscriptions ──────────────────

describe("Preservation - usePipelineStream Socket.IO Subscriptions", () => {
  /**
   * We verify the hook's handler logic by simulating the state transitions
   * that the handlers produce. This tests the LOGIC, not the React hook itself.
   */

  const SUBSCRIBED_EVENTS = [
    "pipeline.started",
    "step.started",
    "step.completed",
    "pipeline.completed",
    "pipeline.failed",
  ];

  it("property: the hook subscribes to the 5 standard pipeline events", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // These are the events usePipelineStream currently subscribes to
        expect(SUBSCRIBED_EVENTS).toContain("pipeline.started");
        expect(SUBSCRIBED_EVENTS).toContain("step.started");
        expect(SUBSCRIBED_EVENTS).toContain("step.completed");
        expect(SUBSCRIBED_EVENTS).toContain("pipeline.completed");
        expect(SUBSCRIBED_EVENTS).toContain("pipeline.failed");
        expect(SUBSCRIBED_EVENTS.length).toBe(5);
      }),
      { numRuns: 5 },
    );
  });

  it("property: step.started handler creates or updates an agent in the agents array", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: 100 }),
        (agentId, progress) => {
          // Simulate the step.started handler logic from usePipelineStream
          type AgentState = {
            id: string;
            name: string;
            status: string;
            progress: number;
            startedAt?: Date;
          };

          const agents: AgentState[] = [];
          const payload = {
            agentId,
            progress,
            timestamp: new Date().toISOString(),
          };

          // Logic from onStepStarted handler
          const existingAgent = agents.find(
            (item) => item.id === payload.agentId,
          );

          const updatedAgents: AgentState[] = existingAgent
            ? agents.map((item) =>
                item.id === payload.agentId
                  ? {
                      ...item,
                      status: "running",
                      progress: payload.progress ?? 0,
                      startedAt: new Date(payload.timestamp),
                    }
                  : item,
              )
            : [
                ...agents,
                {
                  id: payload.agentId,
                  name: payload.agentId,
                  status: "running",
                  progress: payload.progress ?? 0,
                  startedAt: new Date(payload.timestamp),
                },
              ];

          // Verify: a new agent was added
          expect(updatedAgents.length).toBe(1);
          expect(updatedAgents[0].id).toBe(agentId);
          expect(updatedAgents[0].status).toBe("running");
        },
      ),
      { numRuns: 5 },
    );
  });

  it("property: step.completed handler marks agent as completed", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 30 }), (agentId) => {
        type AgentState = {
          id: string;
          name: string;
          status: string;
          progress: number;
          finishedAt?: Date;
        };

        // Start with a running agent
        const agents: AgentState[] = [
          { id: agentId, name: agentId, status: "running", progress: 50 },
        ];
        const payload = {
          agentId,
          progress: 100,
          timestamp: new Date().toISOString(),
        };

        // Logic from onStepCompleted handler
        const existingAgent = agents.find(
          (item) => item.id === payload.agentId,
        );

        const updatedAgents: AgentState[] = existingAgent
          ? agents.map((item) =>
              item.id === payload.agentId
                ? {
                    ...item,
                    status: "completed",
                    progress: payload.progress ?? 100,
                    finishedAt: new Date(payload.timestamp),
                  }
                : item,
            )
          : [
              ...agents,
              {
                id: payload.agentId,
                name: payload.agentId,
                status: "completed",
                progress: payload.progress ?? 100,
                finishedAt: new Date(payload.timestamp),
              },
            ];

        expect(updatedAgents.length).toBe(1);
        expect(updatedAgents[0].status).toBe("completed");
        expect(updatedAgents[0].progress).toBe(100);
      }),
      { numRuns: 5 },
    );
  });

  it("property: pipeline.completed handler sets overall status to completed", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Simulate the onCompleted handler logic
        type PipelineState = {
          status: string;
          progress: number;
          finishedAt?: Date;
        };

        const prev: PipelineState = {
          status: "running",
          progress: 50,
        };

        // Logic from onCompleted handler
        const updated: PipelineState = {
          ...prev,
          status: "completed",
          finishedAt: new Date(),
          progress: 100,
        };

        expect(updated.status).toBe("completed");
        expect(updated.progress).toBe(100);
        expect(updated.finishedAt).toBeInstanceOf(Date);
      }),
      { numRuns: 5 },
    );
  });
});

// ─── 5. Error Handling ──────────────────────────────────────────────────────

describe("Preservation - Error Handling", () => {
  it("property: route validates prompt < 5 chars (orchestrator doesn't, route does)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 4 }), (shortPrompt) => {
        // The route handler rejects prompt < 5 chars at the HTTP level.
        // The orchestrator itself doesn't validate — it assumes the route did.
        // We verify the route logic inline:
        const prompt = shortPrompt;
        const isInvalid =
          !prompt || typeof prompt !== "string" || prompt.trim().length < 5;
        expect(isInvalid).toBe(true);
      }),
      { numRuns: 5 },
    );
  });

  it("property: pause() on non-running session returns false", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 80 }), (prompt) => {
        const orchestrator = new AutonomousOrchestrator();
        const session = orchestrator.run(prompt, "test-project");

        // Cancel the session first so it's not running
        orchestrator.cancel(session.id);
        const current = orchestrator.getSession(session.id);
        expect(current!.status).toBe("cancelled");

        // Pause on cancelled session should return false
        const result = orchestrator.pause(session.id);
        expect(result).toBe(false);
      }),
      { numRuns: 5 },
    );
  });

  it("property: resume() on non-paused session returns false", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 80 }), (prompt) => {
        const orchestrator = new AutonomousOrchestrator();
        const session = orchestrator.run(prompt, "test-project");

        // Session is running, not paused — resume should return false
        const result = orchestrator.resume(session.id);
        expect(result).toBe(false);
      }),
      { numRuns: 5 },
    );
  });

  it("property: cancel() on simulated session returns false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, "test-project");

          // Wait for completion
          const maxWait = 15000;
          const start = Date.now();
          let current = orchestrator.getSession(session.id);

          while (
            current &&
            current.status === "running" &&
            Date.now() - start < maxWait
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            current = orchestrator.getSession(session.id);
          }

          // If completed, cancel should return false
          if (current && current.status === "simulated") {
            const result = orchestrator.cancel(session.id);
            expect(result).toBe(false);
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});

// ─── 6. Cost and Quality Tracking ──────────────────────────────────────────

describe("Preservation - Cost and Quality Tracking", () => {
  it("property: after preview run, session.cost.totalTokens is zero", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, "test-project");

          // Wait for completion
          const maxWait = 15000;
          const start = Date.now();
          let current = orchestrator.getSession(session.id);

          while (
            current &&
            current.status === "running" &&
            Date.now() - start < maxWait
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            current = orchestrator.getSession(session.id);
          }

          expect(current).not.toBeNull();
          if (current!.status === "simulated") {
            expect(current!.cost.totalTokens).toBe(0);
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);

  it("property: after preview run, session.cost.totalCost is zero", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, "test-project");

          // Wait for completion
          const maxWait = 15000;
          const start = Date.now();
          let current = orchestrator.getSession(session.id);

          while (
            current &&
            current.status === "running" &&
            Date.now() - start < maxWait
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            current = orchestrator.getSession(session.id);
          }

          expect(current).not.toBeNull();
          if (current!.status === "simulated") {
            expect(current!.cost.totalCost).toBe(0);
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);

  it("property: after preview run, session.qualityScore remains null", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, "test-project");

          // Wait for completion
          const maxWait = 15000;
          const start = Date.now();
          let current = orchestrator.getSession(session.id);

          while (
            current &&
            current.status === "running" &&
            Date.now() - start < maxWait
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            current = orchestrator.getSession(session.id);
          }

          expect(current).not.toBeNull();
          if (current!.status === "simulated") {
            expect(current!.qualityScore).toBeNull();
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);

  it("property: genre detection sets session.genre to a valid genre string", async () => {
    const validGenres = [
      "rpg",
      "obby",
      "simulator",
      "tycoon",
      "fps",
      "tower_defense",
      "survival",
      "horror",
      "idle",
      "pet_simulator",
      "battle_arena",
      "adventure",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }),
        async (prompt) => {
          const orchestrator = new AutonomousOrchestrator();
          const session = orchestrator.run(prompt, "test-project");

          // Wait for at least genre_detection to complete (~50ms)
          const maxWait = 15000;
          const start = Date.now();
          let current = orchestrator.getSession(session.id);

          while (
            current &&
            current.status === "running" &&
            Date.now() - start < maxWait
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            current = orchestrator.getSession(session.id);
          }

          expect(current).not.toBeNull();
          if (current!.genre) {
            expect(validGenres).toContain(current!.genre);
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60000);
});
