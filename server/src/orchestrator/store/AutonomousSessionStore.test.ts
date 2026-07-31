import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../platform/storage/StorageProvider";
import { StorageAutonomousSessionStore } from "../../platform/storage/OperationalStoreComposition";
import { createAutonomousPhaseContext } from "../AutonomousPhaseRegistry";
import type { OrchestratorSession } from "../OrchestratorTypes";
import type { AutonomousSessionRecord } from "./AutonomousSessionStore";

class RejectingRecoveryStorage extends InMemoryStorageProvider {
  override async applyDurableBatch(
    _mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    throw new DurableStorageError(
      "Injected autonomous recovery rejection",
      "transaction",
    );
  }
}

class RejectingSaveStorage extends InMemoryStorageProvider {
  reject = false;

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    if (this.reject) {
      throw new DurableStorageError(
        "Injected autonomous save rejection",
        "set",
      );
    }
    await super.setDurable(collection, id, data);
  }
}

function createRecord(
  id: string,
  status: OrchestratorSession["status"] = "running",
): AutonomousSessionRecord {
  const session: OrchestratorSession = {
    id,
    projectId: `project-${id}`,
    prompt: "Build a durable obby preview",
    executionMode: "bounded",
    resultAuthority: "preview-only",
    status,
    currentPhase:
      status === "running"
        ? "blueprint"
        : status === "paused"
          ? "paused"
          : "preview_completed",
    phases: [
      {
        id: "node-blueprint",
        phase: "blueprint",
        status: status === "running" ? "running" : "completed",
        startedAt: 100,
      },
      {
        id: "node-preview-completed",
        phase: "preview_completed",
        status: status === "preview_completed" ? "completed" : "pending",
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
      totalTokens: 12,
      totalCost: 0.25,
      totalTimeMs: 42,
      source: "measured",
      perPhase: {},
    },
    checkpoints: [
      {
        id: `${id}:checkpoint:4`,
        phase: "knowledge_search",
        timestamp: 90,
        snapshot: { durable: true },
      },
    ],
    qualityScore: 75,
    startedAt: 50,
    recoveryCount: 0,
    executionGeneration: 0,
  };
  if (status === "preview_completed") {
    session.finishedAt = 200;
    session.terminalEvidenceId = `${id}:terminal:0`;
  }
  return {
    session,
    context: createAutonomousPhaseContext(session.projectId, session.prompt),
    checkpointSequence: 4,
  };
}

describe("StorageAutonomousSessionStore", () => {
  it("recreates acknowledged session, context, cost and checkpoint state", async () => {
    const storage = new InMemoryStorageProvider();
    const writer = new StorageAutonomousSessionStore(storage);
    const record = createRecord("session-recreated", "paused");
    await writer.save(record);

    const recreated = new StorageAutonomousSessionStore(storage);
    expect(recreated.get(record.session.id)).toEqual(record);
    expect(recreated.get(record.session.id)).not.toBe(record);

    record.session.cost.totalCost = 999;
    expect(recreated.get(record.session.id)?.session.cost.totalCost).toBe(0.25);
  });

  it("classifies running state once and preserves checkpoint sequence and cost", async () => {
    const storage = new InMemoryStorageProvider();
    const writer = new StorageAutonomousSessionStore(storage);
    const record = createRecord("session-running");
    await writer.save(record);

    const recreated = new StorageAutonomousSessionStore(storage);
    await expect(recreated.markInterrupted()).resolves.toBe(1);
    await expect(recreated.markInterrupted()).resolves.toBe(0);

    const interrupted = recreated.get(record.session.id);
    expect(interrupted).toMatchObject({
      checkpointSequence: 4,
      session: {
        status: "paused",
        currentPhase: "paused",
        restartInterruptedAt: 100,
        recoveryReason: "server_restart",
        cost: { totalCost: 0.25 },
        checkpoints: [{ id: "session-running:checkpoint:4" }],
      },
    });
    expect(interrupted?.session.phases[0].status).toBe("pending");
  });

  it("has one concurrent recovery winner", async () => {
    const storage = new InMemoryStorageProvider();
    const writer = new StorageAutonomousSessionStore(storage);
    await writer.save(createRecord("session-race"));

    const first = new StorageAutonomousSessionStore(storage);
    const second = new StorageAutonomousSessionStore(storage);
    const results = await Promise.all([
      first.markInterrupted(),
      second.markInterrupted(),
    ]);

    expect(results.sort()).toEqual([0, 1]);
    expect(first.get("session-race")?.session.status).toBe("paused");
    expect(second.get("session-race")?.session.status).toBe("paused");
  });

  it("allows a later restart after an explicit recovery generation", async () => {
    const storage = new InMemoryStorageProvider();
    const store = new StorageAutonomousSessionStore(storage);
    const record = createRecord("session-second-restart");
    await store.save(record);

    await expect(store.markInterrupted()).resolves.toBe(1);
    const resumed = store.get(record.session.id)!;
    resumed.session.status = "running";
    resumed.session.currentPhase = "blueprint";
    resumed.session.recoveryCount = 1;
    resumed.session.restartInterruptedAt = undefined;
    resumed.session.recoveryReason = undefined;
    resumed.session.phases[0].status = "running";
    resumed.session.phases[0].startedAt = 300;
    await store.save(resumed);

    await expect(store.markInterrupted()).resolves.toBe(1);
    await expect(store.markInterrupted()).resolves.toBe(0);
    expect(store.get(record.session.id)?.session).toMatchObject({
      status: "paused",
      recoveryCount: 1,
      restartInterruptedAt: 300,
      recoveryReason: "server_restart",
    });
  });

  it("has one cross-process execution claim winner per generation", async () => {
    const storage = new InMemoryStorageProvider();
    const writer = new StorageAutonomousSessionStore(storage);
    const resumed = createRecord("session-execution-claim", "paused");
    resumed.session.status = "running";
    resumed.session.currentPhase = "blueprint";
    resumed.session.executionGeneration = 1;

    const first = new StorageAutonomousSessionStore(storage);
    const second = new StorageAutonomousSessionStore(storage);
    const results = await Promise.all([
      first.claimExecution(resumed),
      second.claimExecution(resumed),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(first.get(resumed.session.id)?.session.executionGeneration).toBe(1);
    expect(second.get(resumed.session.id)?.session.executionGeneration).toBe(1);

    const nextGeneration = structuredClone(resumed);
    nextGeneration.session.executionGeneration = 2;
    await expect(first.claimExecution(nextGeneration)).resolves.toBe(true);
  });

  it("leaves paused and terminal sessions unchanged", async () => {
    const storage = new InMemoryStorageProvider();
    const store = new StorageAutonomousSessionStore(storage);
    const paused = createRecord("session-paused", "paused");
    const completed = createRecord("session-completed", "preview_completed");
    await store.save(paused);
    await store.save(completed);

    await expect(store.markInterrupted()).resolves.toBe(0);
    expect(store.get(paused.session.id)).toEqual(paused);
    expect(store.get(completed.session.id)).toEqual(completed);
  });

  it("preserves exact acknowledged state when recovery persistence rejects", async () => {
    const storage = new RejectingRecoveryStorage();
    const store = new StorageAutonomousSessionStore(storage);
    const running = createRecord("session-rejected");
    await store.save(running);
    const before = store.get(running.session.id);

    await expect(store.markInterrupted()).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(store.get(running.session.id)).toEqual(before);
  });

  it("does not publish a lifecycle mutation when durable save rejects", async () => {
    const storage = new RejectingSaveStorage();
    const store = new StorageAutonomousSessionStore(storage);
    const running = createRecord("session-save-rejected");
    await store.save(running);
    const before = store.get(running.session.id);

    const paused = structuredClone(running);
    paused.session.status = "paused";
    paused.session.currentPhase = "paused";
    storage.reject = true;

    await expect(store.save(paused)).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(store.get(running.session.id)).toEqual(before);
  });

  it("serializes domain state without runtime handles", async () => {
    const storage = new InMemoryStorageProvider();
    const store = new StorageAutonomousSessionStore(storage);
    const record = createRecord("session-serializable");
    await store.save(record);

    const serialized = JSON.stringify(store.get(record.session.id));
    expect(serialized).not.toContain("AbortController");
    expect(serialized).not.toContain("activeExecutions");
    expect(serialized).not.toContain("restartRequests");
  });
});
