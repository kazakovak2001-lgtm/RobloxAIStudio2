/**
 * MAR-004 — a retried start request is the same start, not a second one.
 *
 * Single-flight is already durable: a claim naming the owning execution is
 * written with `requireAbsent` in the same transaction as the start evidence,
 * so a second concurrent start is refused by storage rather than by a lock.
 *
 * That leaves the client with no safe retry. A start request that succeeded on
 * the server and whose response was lost — a dropped connection, a proxy
 * timeout, a client that gave up — is indistinguishable to the caller from one
 * that never arrived. Sending it again gets a conflict naming somebody's
 * execution, and the caller cannot tell whether it is their own run or a
 * genuine collision with another. The only options were to poll and guess, or
 * to abandon a run that is already going.
 *
 * The fix is a durable idempotency record committed in the same batch as the
 * claim and the evidence, so a repeated request with the same key returns the
 * execution the first one started: no new work, no second execution, no
 * incremented count, and no LLM spend. A different request under the same key
 * is a conflict rather than a silent substitution, because two different
 * requests claiming one identity is a caller bug that must not be papered over.
 */

import { describe, expect, it } from "vitest";
import {
  ActiveGenerationConflictError,
  IdempotencyConflictError,
  ProjectGenerationStartCoordinator,
} from "../platform/projects/ProjectLifecycleCoordinator";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import type { GenerationExecution } from "../types/blueprint";

const PROJECT = "project-alpha";
const PROJECTS = "projects";
const EXECUTIONS = "generation_executions";
const CLAIMS = "generation_active_claims";
const IDEMPOTENCY = "generation_start_requests";

interface StoredProject {
  id: string;
  generationCount: number;
  status: string;
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
  const coordinator = new ProjectGenerationStartCoordinator(projects, storage);
  const prepared: string[] = [];
  const enqueued: string[] = [];

  /** One start request. `request` is what identifies it for idempotency. */
  const startOnce = (
    executionId: string,
    request?: { key: string; principal: string; fingerprint: string },
  ) =>
    coordinator.start(
      PROJECT,
      async () => {
        prepared.push(executionId);
        return { execution: execution(executionId) };
      },
      ({ execution: record }) => [
        {
          operation: "set" as const,
          collection: EXECUTIONS,
          id: record.id,
          data: record,
        },
      ],
      ({ execution: record }) => record.id,
      ({ execution: record }) => enqueued.push(record.id),
      request
        ? {
            ...request,
            // On a replay nothing was prepared, so the caller rebuilds its own
            // shape from the execution that already exists.
            replay: async (executionId: string) => ({
              execution:
                storage.get<GenerationExecution>(EXECUTIONS, executionId) ??
                execution(executionId),
            }),
          }
        : undefined,
    );

  return {
    storage,
    startOnce,
    prepared,
    enqueued,
    project: () => storage.get<StoredProject>(PROJECTS, PROJECT),
    claim: () => storage.get<{ executionId: string }>(CLAIMS, PROJECT),
    executions: () => storage.list(EXECUTIONS, () => true),
    release: () =>
      storage.applyDurableBatch([
        { operation: "delete", collection: CLAIMS, id: PROJECT },
      ]),
  };
}

const REQUEST = {
  key: "client-key-1",
  principal: "owner",
  fingerprint: "blueprint-1",
};

describe("MAR-004 a lost response is retried, not re-run", () => {
  it("returns the first execution when the same request is repeated", async () => {
    const f = fixture();

    const first = await f.startOnce("exec-1", REQUEST);
    // The response never reaches the caller. Everything durable is already
    // committed, which is exactly why the retry is dangerous today.
    const retry = await f.startOnce("exec-2", REQUEST);

    expect(retry.execution.id).toBe(first.execution.id);
    expect(f.executions()).toHaveLength(1);
  });

  it("charges the retry nothing", async () => {
    const f = fixture();

    await f.startOnce("exec-1", REQUEST);
    await f.startOnce("exec-2", REQUEST);

    // A retry that re-prepared or re-enqueued would spend provider budget a
    // second time, which is the cost this exists to prevent.
    expect(f.prepared).toEqual(["exec-1"]);
    expect(f.enqueued).toEqual(["exec-1"]);
    expect(f.project()?.generationCount).toBe(1);
  });

  it("still answers after the run has finished and released its claim", async () => {
    const f = fixture();

    const first = await f.startOnce("exec-1", REQUEST);
    await f.release();

    // The claim is gone, so nothing about the active run can answer this. The
    // idempotency record has to outlive it, or a late retry silently starts a
    // second generation.
    const retry = await f.startOnce("exec-2", REQUEST);

    expect(retry.execution.id).toBe(first.execution.id);
    expect(f.executions()).toHaveLength(1);
    expect(f.project()?.generationCount).toBe(1);
  });

  it("survives a restart, because the record is in storage", async () => {
    const storage = new InMemoryStorageProvider();
    const first = await fixture(storage).startOnce("exec-1", REQUEST);

    // A second coordinator over the same storage stands in for another process
    // or a restarted one. A process-local memo would answer differently here.
    const retry = await fixture(storage).startOnce("exec-2", REQUEST);

    expect(retry.execution.id).toBe(first.execution.id);
  });
});

describe("MAR-004 one key means one request", () => {
  it("refuses the same key with a different payload", async () => {
    const f = fixture();
    await f.startOnce("exec-1", REQUEST);

    await expect(
      f.startOnce("exec-2", { ...REQUEST, fingerprint: "blueprint-2" }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(f.executions()).toHaveLength(1);
  });

  it("refuses the same key from a different principal", async () => {
    const f = fixture();
    await f.startOnce("exec-1", REQUEST);

    // Returning the first caller's execution here would hand one caller's run
    // to another.
    await expect(
      f.startOnce("exec-2", { ...REQUEST, principal: "someone-else" }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});

describe("MAR-004 single-flight is unchanged", () => {
  it("still refuses a different request while a run is active", async () => {
    const f = fixture();
    await f.startOnce("exec-1", REQUEST);

    await expect(
      f.startOnce("exec-2", { ...REQUEST, key: "client-key-2" }),
    ).rejects.toBeInstanceOf(ActiveGenerationConflictError);
  });

  it("still refuses an unkeyed start while a run is active", async () => {
    const f = fixture();
    await f.startOnce("exec-1", REQUEST);

    // A caller that sends no key gets the existing policy, unchanged.
    await expect(f.startOnce("exec-2")).rejects.toBeInstanceOf(
      ActiveGenerationConflictError,
    );
  });

  it("admits a new key once the previous run released its claim", async () => {
    const f = fixture();
    await f.startOnce("exec-1", REQUEST);
    await f.release();

    const second = await f.startOnce("exec-2", {
      ...REQUEST,
      key: "client-key-2",
    });

    // A genuinely new request is a new run. Idempotency must not become a lock.
    expect(second.execution.id).toBe("exec-2");
    expect(f.project()?.generationCount).toBe(2);
  });
});

describe("MAR-004 the record commits with everything else", () => {
  it("leaves no idempotency record when the start batch rejects", async () => {
    const storage = new InMemoryStorageProvider();
    const f = fixture(storage);

    // Somebody else holds the project, so the batch carrying the evidence, the
    // claim and the idempotency record must reject as one.
    await storage.applyDurableBatch([
      {
        operation: "set",
        collection: CLAIMS,
        id: PROJECT,
        data: { executionId: "someone-else", startedAt: 0 },
      },
    ]);

    await expect(f.startOnce("exec-1", REQUEST)).rejects.toBeInstanceOf(
      ActiveGenerationConflictError,
    );

    // A record written outside the transaction would answer a later retry with
    // an execution that was never created.
    expect(storage.list(IDEMPOTENCY, () => true)).toHaveLength(0);
  });
});
