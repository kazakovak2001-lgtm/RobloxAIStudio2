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
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
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
});
