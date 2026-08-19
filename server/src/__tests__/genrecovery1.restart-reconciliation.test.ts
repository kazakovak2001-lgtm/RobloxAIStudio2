/**
 * GEN-RECOVERY-1 / AUDIT-RECOVERY-001 — no execution stays `running` forever.
 *
 * The execution record is durable, but the worker advancing it is process
 * local. A crash or a SIGTERM mid-run therefore left an execution durably
 * `running` with nothing left to finish it, and its project stuck in
 * `generating`. Since admission became claim-based, that also meant the project
 * could never start another generation, so the sweep is not cosmetic.
 *
 * The existing restart test proved only that the record survived, which is a
 * weaker property than the workflow being reconciled. AUDIT-RESTART-TEST-WEAK-001.
 */

import { describe, expect, it } from "vitest";
import {
  RESTART_INTERRUPTION_MESSAGE,
  reconcileInterruptedGenerations,
} from "../platform/projects/GenerationRecovery";
import {
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../platform/storage/StorageProvider";
import { ProjectGenerationStartCoordinator } from "../platform/projects/ProjectLifecycleCoordinator";
import type { GenerationExecution } from "../types/blueprint";

const PROJECT = "project-alpha";
const PROJECTS = "projects";
const EXECUTIONS = "generation_executions";
const HISTORY = "generation_history";
const CLAIMS = "generation_active_claims";

function runningExecution(
  id: string,
  projectId = PROJECT,
): GenerationExecution {
  return {
    id,
    blueprint_id: "blueprint-1",
    project_id: projectId,
    user_id: "owner",
    started_at: new Date(0),
    status: "running",
    retry_count: 0,
    pipeline_steps: [],
  };
}

/** A backend that died mid-generation: durable state with no worker. */
function crashedState() {
  const storage = new InMemoryStorageProvider();
  storage.set(PROJECTS, PROJECT, {
    id: PROJECT,
    status: "generating",
    generationCount: 1,
  });
  storage.set(EXECUTIONS, "exec-stranded", runningExecution("exec-stranded"));
  storage.set(HISTORY, "exec-stranded", {
    id: "exec-stranded",
    projectId: PROJECT,
    pipelineId: "exec-stranded",
    status: "running",
    startedAt: 0,
  });
  storage.set(CLAIMS, PROJECT, {
    executionId: "exec-stranded",
    startedAt: 0,
  });
  return storage;
}

describe("GEN-RECOVERY-1 restart reconciliation", () => {
  it("closes a stranded execution and releases its project", async () => {
    const storage = crashedState();

    const report = await reconcileInterruptedGenerations(storage, 1000);

    expect(report.interrupted).toEqual(["exec-stranded"]);
    const execution = storage.get<GenerationExecution>(
      EXECUTIONS,
      "exec-stranded",
    );
    expect(execution?.status).toBe("failed");
    // Says what happened rather than implying the generation failed on merit.
    expect(execution?.error_message).toBe(RESTART_INTERRUPTION_MESSAGE);
    expect(execution?.restart_interrupted_at).toBe(1000);
    expect(storage.get<{ status: string }>(PROJECTS, PROJECT)?.status).toBe(
      "draft",
    );
    expect(storage.get(CLAIMS, PROJECT)).toBeNull();
    expect(
      storage.get<{ status: string }>(HISTORY, "exec-stranded"),
    ).toMatchObject({ status: "failed", finishedAt: 1000 });
  });

  it("lets the project start a new generation afterwards", async () => {
    const storage = crashedState();
    await reconcileInterruptedGenerations(storage, 1000);

    // The claim is what previously made this permanent: with it stranded, no
    // further generation could ever be admitted for the project.
    expect(storage.get(CLAIMS, PROJECT)).toBeNull();
  });

  it("leaves terminal executions untouched", async () => {
    const storage = crashedState();
    storage.set(EXECUTIONS, "exec-done", {
      ...runningExecution("exec-done"),
      status: "completed",
      completed_at: new Date(5),
    });
    const before = JSON.stringify(storage.get(EXECUTIONS, "exec-done"));

    await reconcileInterruptedGenerations(storage, 1000);

    expect(JSON.stringify(storage.get(EXECUTIONS, "exec-done"))).toBe(before);
  });

  it("does not reset a project a newer generation already took over", async () => {
    const storage = crashedState();
    // A newer run owns the project; the stranded one is from before the crash.
    storage.set(CLAIMS, PROJECT, { executionId: "exec-newer", startedAt: 50 });

    await reconcileInterruptedGenerations(storage, 1000);

    // The stranded execution is still closed, but the live project is not
    // disturbed and the newer run keeps its claim.
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")?.status,
    ).toBe("failed");
    expect(storage.get<{ status: string }>(PROJECTS, PROJECT)?.status).toBe(
      "generating",
    );
    expect(storage.get<{ executionId: string }>(CLAIMS, PROJECT)).toMatchObject(
      { executionId: "exec-newer" },
    );
  });

  it("is idempotent across repeated boots", async () => {
    const storage = crashedState();

    const first = await reconcileInterruptedGenerations(storage, 1000);
    const second = await reconcileInterruptedGenerations(storage, 2000);

    expect(first.interrupted).toEqual(["exec-stranded"]);
    // Nothing is left running, so the second boot finds nothing to do and does
    // not rewrite the outcome with a later timestamp.
    expect(second.interrupted).toEqual([]);
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")
        ?.restart_interrupted_at,
    ).toBe(1000);
  });

  it("skips an execution another instance is already recovering", async () => {
    const storage = crashedState();
    // Another instance got there first and holds the recovery claim. Racing the
    // two calls in-process would not reproduce this: the in-memory provider
    // applies a batch before its promise yields, so the second call would
    // simply find nothing running. Seeding the claim tests the guard itself.
    storage.set("generation_recovery_claims", "exec-stranded", {
      executionId: "exec-stranded",
      interruptedAt: 900,
    });
    const projectBefore = JSON.stringify(storage.get(PROJECTS, PROJECT));

    const report = await reconcileInterruptedGenerations(storage, 1000);

    expect(report.interrupted).toEqual([]);
    expect(report.skipped).toEqual(["exec-stranded"]);
    // The whole batch was refused, so this instance changed nothing at all.
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")?.status,
    ).toBe("running");
    expect(JSON.stringify(storage.get(PROJECTS, PROJECT))).toBe(projectBefore);
  });

  it("does not touch another project's stranded execution or claim", async () => {
    const storage = crashedState();
    const OTHER = "project-beta";
    storage.set(PROJECTS, OTHER, {
      id: OTHER,
      status: "generating",
      generationCount: 1,
    });
    storage.set(
      EXECUTIONS,
      "exec-other",
      runningExecution("exec-other", OTHER),
    );
    storage.set(CLAIMS, OTHER, { executionId: "exec-other", startedAt: 0 });

    await reconcileInterruptedGenerations(storage, 1000);

    // Both are genuinely stranded, so both are closed — but each project's
    // release is scoped to its own execution and claim, never the other's.
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-other")?.status,
    ).toBe("failed");
    expect(storage.get<{ status: string }>(PROJECTS, OTHER)?.status).toBe(
      "draft",
    );
    expect(storage.get(CLAIMS, OTHER)).toBeNull();
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")?.status,
    ).toBe("failed");
    expect(storage.get<{ status: string }>(PROJECTS, PROJECT)?.status).toBe(
      "draft",
    );
  });

  it("propagates a non-conflict storage failure instead of reporting recovery", async () => {
    const storage = crashedState();
    let calls = 0;
    const originalApply = storage.applyDurableBatch.bind(storage);
    // A transport/durability failure, not a `requireAbsent` race. The recovery
    // sweep must not treat this like "someone else already recovered it" —
    // that would silently report success for a batch that never committed.
    storage.applyDurableBatch = async (
      mutations: readonly DurableMutation[],
    ): Promise<readonly DurableMutationResult[]> => {
      calls += 1;
      throw new Error("simulated durable write failure");
    };

    await expect(
      reconcileInterruptedGenerations(storage, 1000),
    ).rejects.toThrow("simulated durable write failure");
    expect(calls).toBe(1);

    // Restore the real implementation and confirm nothing committed: the
    // execution is still running and retryable on the next boot.
    storage.applyDurableBatch = originalApply;
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")?.status,
    ).toBe("running");
    expect(storage.get(CLAIMS, PROJECT)).not.toBeNull();

    const retry = await reconcileInterruptedGenerations(storage, 2000);
    expect(retry.interrupted).toEqual(["exec-stranded"]);
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")?.status,
    ).toBe("failed");
  });

  it("converges on one durable result under concurrent recovery calls", async () => {
    const storage = crashedState();

    const [first, second] = await Promise.all([
      reconcileInterruptedGenerations(storage, 1000),
      reconcileInterruptedGenerations(storage, 1000),
    ]);

    // Exactly one call closed the execution; the other found nothing left to
    // do (or, had it raced in, would have been refused by the recovery claim).
    const closedBy = [...first.interrupted, ...second.interrupted];
    expect(closedBy).toEqual(["exec-stranded"]);
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")?.status,
    ).toBe("failed");
    expect(storage.get(CLAIMS, PROJECT)).toBeNull();
  });

  it("lets the project admit a new generation through the start coordinator after recovery", async () => {
    const storage = crashedState();
    await reconcileInterruptedGenerations(storage, 1000);

    const projects = {
      get: (projectId: string) =>
        storage.get<{ id: string; generationCount: number; status: string }>(
          PROJECTS,
          projectId,
        ),
      updateDurable: async () => {
        throw new Error("start() must not use the standalone project write");
      },
    };
    const coordinator = new ProjectGenerationStartCoordinator(
      projects,
      storage,
    );

    const started = await coordinator.start(
      PROJECT,
      async () => ({ execution: runningExecution("exec-fresh") }),
      ({ execution: record }) => [
        {
          operation: "set" as const,
          collection: EXECUTIONS,
          id: record.id,
          data: record,
        },
      ],
      ({ execution: record }) => record.id,
      () => undefined,
    );

    expect(started.execution.id).toBe("exec-fresh");
    expect(storage.get<{ executionId: string }>(CLAIMS, PROJECT)).toMatchObject(
      { executionId: "exec-fresh" },
    );
    // The interrupted run stays failed; recovery did not resurrect it just
    // because a new one started.
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-stranded")?.status,
    ).toBe("failed");
  });

  it("replays the original idempotency key into the truthful interrupted execution, not a duplicate", async () => {
    const storage = new InMemoryStorageProvider();
    storage.set(PROJECTS, PROJECT, {
      id: PROJECT,
      status: "draft",
      generationCount: 0,
    });

    const projects = {
      get: (projectId: string) =>
        storage.get<{ id: string; generationCount: number; status: string }>(
          PROJECTS,
          projectId,
        ),
      updateDurable: async () => {
        throw new Error("start() must not use the standalone project write");
      },
    };
    const coordinator = new ProjectGenerationStartCoordinator(
      projects,
      storage,
    );
    const REQUEST = {
      key: "client-key-crash",
      principal: "owner",
      fingerprint: "blueprint-1",
    };

    const startOnce = (executionId: string) =>
      coordinator.start(
        PROJECT,
        async () => ({ execution: runningExecution(executionId) }),
        ({ execution: record }) => [
          {
            operation: "set" as const,
            collection: EXECUTIONS,
            id: record.id,
            data: record,
          },
        ],
        ({ execution: record }) => record.id,
        () => undefined,
        {
          ...REQUEST,
          replay: async (executionId: string) => ({
            execution:
              storage.get<GenerationExecution>(EXECUTIONS, executionId) ??
              runningExecution(executionId),
          }),
        },
      );

    // Original request starts the run; the process dies before it finishes.
    const original = await startOnce("exec-crashed");

    // Restart reconciliation closes it truthfully.
    await reconcileInterruptedGenerations(storage, 1000);
    expect(
      storage.get<GenerationExecution>(EXECUTIONS, "exec-crashed")?.status,
    ).toBe("failed");

    // The caller's original request is retried against a fresh instance with
    // the same idempotency key. It must not spawn a second execution — it
    // gets back the same execution id, now truthfully reporting interruption.
    const replayed = await startOnce("exec-should-not-be-created");

    expect(replayed.execution.id).toBe(original.execution.id);
    expect(storage.list(EXECUTIONS, () => true)).toHaveLength(1);
    expect(replayed.execution.status).toBe("failed");
    expect(replayed.execution.error_message).toBe(RESTART_INTERRUPTION_MESSAGE);
  });
});
