/**
 * GEN-SINGLEFLIGHT-1 and GEN-OUTCOME-1 — one authoritative generation per project.
 *
 * AUDIT-DUP-GENERATION-001: the project lock only covered the short scheduling
 * section, so a second start for the same project was admitted as soon as the
 * first released it. That produced duplicate AI cost, duplicate executions and
 * two runs racing to set one project's outcome.
 *
 * AUDIT-OUTCOME-LAST-WRITER-001: those two runs could finish in either order,
 * and nothing stopped the older one from overwriting the newer result.
 *
 * Both are closed by one durable record. A claim naming the owning execution is
 * written with `requireAbsent` inside the same transaction as the start
 * evidence, so admission is decided by storage rather than by a lock that only
 * exists in one process, and the terminal commit only touches the project when
 * the finishing run still holds that claim.
 */

import { describe, expect, it } from "vitest";
import {
  ActiveGenerationConflictError,
  GenerationOutcomeCoordinator,
  ProjectGenerationStartCoordinator,
} from "../platform/projects/ProjectLifecycleCoordinator";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import type { GenerationExecution } from "../types/blueprint";

const PROJECT = "project-alpha";
const PROJECTS = "projects";
const EXECUTIONS = "generation_executions";
const HISTORY = "generation_history";
const CLAIMS = "generation_active_claims";

interface StoredProject {
  id: string;
  generationCount: number;
  status: string;
  qualityScore?: number;
}

function execution(id: string): GenerationExecution {
  return {
    id,
    blueprint_id: "blueprint-1",
    project_id: PROJECT,
    user_id: "owner",
    started_at: new Date(0),
    status: "running",
    retry_count: 0,
    pipeline_steps: [],
  };
}

function fixture(storage = new InMemoryStorageProvider()) {
  storage.set<StoredProject>(PROJECTS, PROJECT, {
    id: PROJECT,
    generationCount: 0,
    status: "draft",
  });

  const projects = {
    get: (projectId: string) => storage.get<StoredProject>(PROJECTS, projectId),
    updateDurable: async () => {
      throw new Error("start() must not use the standalone project write");
    },
  };
  const start = new ProjectGenerationStartCoordinator(projects, storage);
  const outcome = new GenerationOutcomeCoordinator(storage);
  const enqueued: string[] = [];

  const startOnce = (executionId: string) =>
    start.start(
      PROJECT,
      async () => ({ execution: execution(executionId) }),
      ({ execution: record }) => [
        {
          operation: "set" as const,
          collection: EXECUTIONS,
          id: record.id,
          data: record,
        },
        {
          operation: "set" as const,
          collection: HISTORY,
          id: record.id,
          data: {
            id: record.id,
            projectId: PROJECT,
            pipelineId: record.id,
            status: record.status,
            startedAt: 0,
            stagesCompleted: 0,
            stagesTotal: 0,
            failures: 0,
            tokenUsage: 0,
            aiCost: 0,
          },
        },
      ],
      ({ execution: record }) => record.id,
      ({ execution: record }) => enqueued.push(record.id),
    );

  return {
    storage,
    outcome,
    startOnce,
    enqueued,
    project: () => storage.get<StoredProject>(PROJECTS, PROJECT),
    claim: () =>
      storage.get<{ executionId: string }>(CLAIMS, PROJECT) ?? undefined,
    executions: () => storage.list<{ id: string }>(EXECUTIONS),
  };
}

describe("GEN-SINGLEFLIGHT-1 admission", () => {
  it("admits the first generation and records the claim", async () => {
    const f = fixture();

    await f.startOnce("exec-1");

    expect(f.claim()?.executionId).toBe("exec-1");
    expect(f.project()?.status).toBe("generating");
    expect(f.project()?.generationCount).toBe(1);
  });

  it("refuses a second start while one is active", async () => {
    const f = fixture();
    await f.startOnce("exec-1");

    await expect(f.startOnce("exec-2")).rejects.toBeInstanceOf(
      ActiveGenerationConflictError,
    );

    // The refusal is a whole-transaction rejection, so the duplicate leaves no
    // execution, no history and no second increment behind.
    expect(f.executions()).toHaveLength(1);
    expect(f.project()?.generationCount).toBe(1);
    expect(f.enqueued).toEqual(["exec-1"]);
  });

  it("refuses the duplicate when two starts race", async () => {
    const f = fixture();

    const results = await Promise.allSettled([
      f.startOnce("exec-a"),
      f.startOnce("exec-b"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(f.executions()).toHaveLength(1);
    expect(f.project()?.generationCount).toBe(1);
  });

  it("decides admission from durable state, not from one process", async () => {
    // Two coordinators over one storage stand in for two backend instances:
    // neither shares the other's in-process lock, so only the durable claim can
    // refuse the duplicate.
    const storage = new InMemoryStorageProvider();
    const first = fixture(storage);
    const second = fixture(storage);

    await first.startOnce("exec-instance-1");
    await expect(second.startOnce("exec-instance-2")).rejects.toBeInstanceOf(
      ActiveGenerationConflictError,
    );

    expect(storage.list(EXECUTIONS)).toHaveLength(1);
  });

  it("admits a new generation once the previous one is terminal", async () => {
    const f = fixture();
    await f.startOnce("exec-1");
    await f.outcome.commit("exec-1", {
      status: "completed",
      completed_at: new Date(1),
    });

    expect(f.claim()).toBeUndefined();
    await expect(f.startOnce("exec-2")).resolves.toBeDefined();
    expect(f.claim()?.executionId).toBe("exec-2");
    expect(f.project()?.generationCount).toBe(2);
  });
});

describe("GEN-OUTCOME-1 fencing", () => {
  it("lets the owning run set the project outcome", async () => {
    const f = fixture();
    await f.startOnce("exec-1");

    await f.outcome.commit("exec-1", {
      status: "completed",
      completed_at: new Date(1),
    });

    expect(f.project()?.status).toBe("ready");
    expect(f.claim()).toBeUndefined();
  });

  it("does not let a stale run overwrite a newer generation's project", async () => {
    const f = fixture();
    // First run starts and finishes, releasing the claim.
    await f.startOnce("exec-old");
    await f.outcome.commit("exec-old", {
      status: "completed",
      completed_at: new Date(1),
    });
    // A newer run takes the project.
    await f.startOnce("exec-new");
    expect(f.project()?.status).toBe("generating");

    // The older execution is re-committed late, as a delayed worker would.
    await f.outcome.commit("exec-old", {
      status: "completed",
      completed_at: new Date(2),
    });

    // It may close its own record, but the project still belongs to the new run.
    expect(f.project()?.status).toBe("generating");
    expect(f.claim()?.executionId).toBe("exec-new");
  });

  it("does not let a stale run release the current run's claim", async () => {
    const f = fixture();
    await f.startOnce("exec-new");
    // An execution that never owned the claim reaches a terminal state.
    f.storage.set(EXECUTIONS, "exec-foreign", {
      ...execution("exec-foreign"),
      status: "running",
    });

    await f.outcome.commit("exec-foreign", {
      status: "failed",
      completed_at: new Date(3),
    });

    expect(f.claim()?.executionId).toBe("exec-new");
    expect(f.project()?.status).toBe("generating");
  });
});
