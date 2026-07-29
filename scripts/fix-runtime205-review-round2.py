from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} marker, found {count}")
    return text.replace(old, new, 1)


types_path = Path("server/src/orchestrator/OrchestratorTypes.ts")
types = types_path.read_text()
types = replace_once(
    types,
    '''export interface Checkpoint {
  phase: OrchestratorPhase;
  timestamp: number;
  snapshot: Record<string, unknown>;
}''',
    '''export interface Checkpoint {
  id: string;
  phase: OrchestratorPhase;
  timestamp: number;
  snapshot: Record<string, unknown>;
}''',
    "Checkpoint interface",
)
types_path.write_text(types)

orchestrator_path = Path("server/src/orchestrator/AutonomousOrchestrator.ts")
orchestrator = orchestrator_path.read_text()
orchestrator = replace_once(
    orchestrator,
    '''  private readonly activeExecutions = new Set<string>();
  private readonly restartRequests = new Set<string>();
  private readonly events?: PipelineEventEmitter;''',
    '''  private readonly activeExecutions = new Set<string>();
  private readonly restartRequests = new Set<string>();
  private readonly checkpointSequences = new Map<string, number>();
  private readonly events?: PipelineEventEmitter;''',
    "checkpoint sequence field",
)
orchestrator = replace_once(
    orchestrator,
    '''  getCapabilities(
    sessionId: string,
  ): Record<RunnableOrchestratorPhase, PhaseCapability> | null {''',
    '''  getCapabilities(
    sessionId: string,
  ): Partial<Record<RunnableOrchestratorPhase, PhaseCapability>> | null {''',
    "partial capabilities return type",
)
orchestrator = replace_once(
    orchestrator,
    '''  recover(sessionId: string, checkpointTimestamp?: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === "running") return false;

    const checkpoint = checkpointTimestamp
      ? session.checkpoints.find(
          (candidate) => candidate.timestamp === checkpointTimestamp,
        )
      : session.checkpoints.at(-1);
    if (!checkpoint) return false;

    const snapshot = checkpoint.snapshot as unknown as CheckpointSnapshot;
    if (!snapshot.context || !Array.isArray(snapshot.phases)) return false;

    this.contexts.set(sessionId, this.clone(snapshot.context));''',
    '''  recover(sessionId: string, checkpointId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === "running") return false;

    const checkpoint = checkpointId
      ? session.checkpoints.find((candidate) => candidate.id === checkpointId)
      : session.checkpoints.at(-1);
    if (!checkpoint || !this.isCheckpointSnapshot(checkpoint.snapshot)) {
      return false;
    }

    const snapshot = checkpoint.snapshot;
    this.contexts.set(sessionId, this.clone(snapshot.context));''',
    "checkpoint recovery",
)
orchestrator = replace_once(
    orchestrator,
    '''      if (session.status === "running" && !this.nextPendingNode(session)) {
        this.finishPreview(session);
      }
    } finally {
      this.activeExecutions.delete(session.id);''',
    '''      if (session.status === "running" && !this.nextPendingNode(session)) {
        this.finishPreview(session);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.status = "failed";
      session.currentPhase = "failed";
      session.finishedAt = Date.now();
      void this.events?.emitPipelineFailed(
        session.id,
        message,
        session.projectId,
        {
          executionMode: session.executionMode,
          resultAuthority: session.resultAuthority,
          completedSteps: session.phases.filter(
            (phaseNode) => phaseNode.status === "completed",
          ).length,
        },
      );
    } finally {
      this.activeExecutions.delete(session.id);''',
    "top-level execution catch",
)
orchestrator = replace_once(
    orchestrator,
    '''    const checkpoint: Checkpoint = {
      phase,
      timestamp: Date.now(),
      snapshot: snapshot as unknown as Record<string, unknown>,
    };''',
    '''    const sequence = (this.checkpointSequences.get(session.id) ?? 0) + 1;
    this.checkpointSequences.set(session.id, sequence);
    const checkpoint: Checkpoint = {
      id: `${session.id}:checkpoint:${sequence}`,
      phase,
      timestamp: Date.now(),
      snapshot: snapshot as unknown as Record<string, unknown>,
    };''',
    "unique checkpoint construction",
)
orchestrator = replace_once(
    orchestrator,
    '''  private emptyCost(): CostTracker {
    return {''',
    '''  private isCheckpointSnapshot(value: unknown): value is CheckpointSnapshot {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const snapshot = value as Partial<CheckpointSnapshot>;
    const context = snapshot.context as
      | Partial<AutonomousPhaseContext>
      | undefined;
    if (
      !context ||
      typeof context.projectId !== "string" ||
      typeof context.prompt !== "string" ||
      !Array.isArray(context.systems) ||
      !Array.isArray(snapshot.phases) ||
      !snapshot.phases.every(
        (node) =>
          Boolean(node) &&
          typeof node.id === "string" &&
          typeof node.phase === "string" &&
          typeof node.status === "string",
      ) ||
      (snapshot.qualityScore !== null &&
        typeof snapshot.qualityScore !== "number") ||
      (snapshot.genre !== undefined && typeof snapshot.genre !== "string") ||
      !this.isCostTracker(snapshot.cost)
    ) {
      return false;
    }

    return true;
  }

  private isCostTracker(value: unknown): value is CostTracker {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const cost = value as Partial<CostTracker>;
    return (
      typeof cost.totalTokens === "number" &&
      Number.isFinite(cost.totalTokens) &&
      typeof cost.totalCost === "number" &&
      Number.isFinite(cost.totalCost) &&
      typeof cost.totalTimeMs === "number" &&
      Number.isFinite(cost.totalTimeMs) &&
      (cost.source === "synthetic" || cost.source === "measured") &&
      Boolean(cost.perPhase) &&
      typeof cost.perPhase === "object" &&
      !Array.isArray(cost.perPhase)
    );
  }

  private emptyCost(): CostTracker {
    return {''',
    "checkpoint snapshot type guards",
)
orchestrator_path.write_text(orchestrator)

registry_path = Path("server/src/orchestrator/AutonomousPhaseRegistry.ts")
registry = registry_path.read_text()
registry = replace_once(
    registry,
    '''function ensureNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Autonomous phase cancelled", "AbortError");
  }
}''',
    '''function ensureNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error("Autonomous phase cancelled");
    error.name = "AbortError";
    throw error;
  }
}''',
    "portable AbortError",
)
if "cancellable: true" not in registry:
    raise SystemExit("Expected cancellable capability declarations")
registry = registry.replace("cancellable: true", "cancellable: false")
registry = replace_once(
    registry,
    '''  listCapabilities(
    context: AutonomousPhaseContext,
  ): Record<RunnableOrchestratorPhase, PhaseCapability> {
    return Object.fromEntries(
      [...this.adapters.entries()].map(([phase, adapter]) => [
        phase,
        adapter.capability(context),
      ]),
    ) as Record<RunnableOrchestratorPhase, PhaseCapability>;
  }''',
    '''  listCapabilities(
    context: AutonomousPhaseContext,
  ): Partial<Record<RunnableOrchestratorPhase, PhaseCapability>> {
    const capabilities: Partial<
      Record<RunnableOrchestratorPhase, PhaseCapability>
    > = {};
    for (const [phase, adapter] of this.adapters) {
      capabilities[phase] = adapter.capability(context);
    }
    return capabilities;
  }''',
    "partial capability map",
)
registry_path.write_text(registry)

route_path = Path("server/src/routes/autonomous.ts")
route = route_path.read_text()
route = replace_once(
    route,
    '''  router.post("/recover/:sessionId", (req, res) => {
    const timestamp = req.body?.checkpointTimestamp;
    if (timestamp !== undefined && !Number.isFinite(timestamp)) {
      res.status(400).json({
        success: false,
        error: "checkpointTimestamp must be a finite number",
      });
      return;
    }
    const ok = orchestrator.recover(req.params.sessionId, timestamp);''',
    '''  router.post("/recover/:sessionId", (req, res) => {
    const rawCheckpointId: unknown = req.body?.checkpointId;
    if (
      rawCheckpointId !== undefined &&
      (typeof rawCheckpointId !== "string" ||
        rawCheckpointId.trim().length === 0)
    ) {
      res.status(400).json({
        success: false,
        error: "checkpointId must be a non-empty string",
      });
      return;
    }
    const checkpointId =
      typeof rawCheckpointId === "string"
        ? rawCheckpointId.trim()
        : undefined;
    const ok = orchestrator.recover(req.params.sessionId, checkpointId);''',
    "checkpoint recovery route",
)
route_path.write_text(route)

bounded_test_path = Path(
    "server/src/orchestrator/AutonomousBoundedPhases.test.ts"
)
bounded_tests = bounded_test_path.read_text()
bounded_tests = replace_once(
    bounded_tests,
    '''import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import type { OrchestratorSession } from "./OrchestratorTypes";''',
    '''import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import {
  AutonomousPhaseRegistry,
  createAutonomousPhaseContext,
} from "./AutonomousPhaseRegistry";
import type { OrchestratorSession } from "./OrchestratorTypes";''',
    "bounded test imports",
)
bounded_tests = bounded_tests.replace(
    '''      service: "generation/lua/LuaGenerationEngine",
    });''',
    '''      service: "generation/lua/LuaGenerationEngine",
      cancellable: false,
    });''',
    1,
)
bounded_tests = bounded_tests.replace(
    '''      service: "PlaytestEngine",
    });''',
    '''      service: "PlaytestEngine",
      cancellable: false,
    });''',
    1,
)
bounded_tests = replace_once(
    bounded_tests,
    '''    expect(orchestrator.recover(session.id, checkpoint.timestamp)).toBe(true);
    await waitForTerminal(session);''',
    '''    const checkpointIds = session.checkpoints.map((item) => item.id);
    expect(new Set(checkpointIds).size).toBe(checkpointIds.length);
    expect(checkpoint.phase).toBe("blueprint");

    expect(orchestrator.recover(session.id, checkpoint.id)).toBe(true);
    expect(
      session.phases.find((phase) => phase.phase === checkpoint.phase)?.status,
    ).toBe("completed");
    await waitForTerminal(session);''',
    "checkpoint id recovery test",
)
bounded_insertion = r'''

  it("returns a partial capability map for a partial registry", () => {
    const registry = new AutonomousPhaseRegistry([]);
    const capabilities = registry.listCapabilities(
      createAutonomousPhaseContext("partial-project", "Build an obby"),
    );

    expect(capabilities).toEqual({});
    expect(capabilities.lua_generation).toBeUndefined();
  });

  it("throws a portable AbortError at phase boundaries", async () => {
    const registry = new AutonomousPhaseRegistry();
    const adapter = registry.get("lua_generation");
    const controller = new AbortController();
    controller.abort("test cancellation");

    expect(adapter).toBeDefined();
    await expect(
      adapter?.execute(
        createAutonomousPhaseContext("abort-project", "Build an RPG"),
        controller.signal,
      ),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "Autonomous phase cancelled",
    });
  });
'''
closing = "\n});\n"
if not bounded_tests.endswith(closing):
    raise SystemExit("Expected bounded test suite closing marker")
bounded_tests = bounded_tests[: -len(closing)] + bounded_insertion + closing
bounded_test_path.write_text(bounded_tests)

orchestrator_test_path = Path(
    "server/src/orchestrator/AutonomousOrchestrator.test.ts"
)
orchestrator_tests = orchestrator_test_path.read_text()
orchestrator_tests = replace_once(
    orchestrator_tests,
    '''import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import type { OrchestratorSession } from "./OrchestratorTypes";''',
    '''import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import {
  AutonomousPhaseRegistry,
  type AutonomousPhaseAdapter,
} from "./AutonomousPhaseRegistry";
import type { OrchestratorSession } from "./OrchestratorTypes";''',
    "orchestrator test imports",
)
orchestrator_insertion = r'''

  it("rejects malformed checkpoint snapshots without corrupting session cost", async () => {
    const orchestrator = new AutonomousOrchestrator();
    const session = orchestrator.run(
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

    expect(orchestrator.recover(session.id, checkpoint.id)).toBe(false);
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
    const session = orchestrator.run(
      "Build an error handling obby",
      "project-top-level-error",
    );

    await waitForTerminal(session);

    expect(session.status).toBe("failed");
    expect(session.currentPhase).toBe("failed");
    expect(
      published.some((event) => event.type === "pipeline.failed"),
    ).toBe(true);
  });
'''
if not orchestrator_tests.endswith(closing):
    raise SystemExit("Expected orchestrator test suite closing marker")
orchestrator_tests = (
    orchestrator_tests[: -len(closing)] + orchestrator_insertion + closing
)
orchestrator_test_path.write_text(orchestrator_tests)
