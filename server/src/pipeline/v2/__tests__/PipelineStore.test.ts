import { beforeEach, describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../../platform/storage/StorageProvider";
import { StoragePipelineStore } from "../../../platform/storage/OperationalStoreComposition";
import { createPipelineState } from "../PipelineStage";
import { InMemoryPipelineStore } from "../store/InMemoryPipelineStore";

class RejectingBatchStorage extends InMemoryStorageProvider {
  override async applyDurableBatch(
    _mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    throw new DurableStorageError(
      "Injected pipeline recovery rejection",
      "transaction",
    );
  }
}

describe("PipelineStore", () => {
  let store: InMemoryPipelineStore;

  beforeEach(() => {
    store = new InMemoryPipelineStore();
  });

  describe("basic operations", () => {
    it("saves and retrieves a pipeline state", async () => {
      const state = createPipelineState("project-1");
      await store.save(state);
      const retrieved = store.get(state.pipelineId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.projectId).toBe("project-1");
    });

    it("returns null for non-existent pipeline", () => {
      expect(store.get("nonexistent")).toBeNull();
    });

    it("counts stored pipelines", async () => {
      expect(store.count()).toBe(0);
      await store.save(createPipelineState("p1"));
      await store.save(createPipelineState("p2"));
      expect(store.count()).toBe(2);
    });

    it("deletes a pipeline", async () => {
      const state = createPipelineState("p1");
      await store.save(state);
      await expect(store.delete(state.pipelineId)).resolves.toBe(true);
      expect(store.get(state.pipelineId)).toBeNull();
    });

    it("getAll returns all states", async () => {
      await store.save(createPipelineState("p1"));
      await store.save(createPipelineState("p2"));
      await store.save(createPipelineState("p3"));
      expect(store.getAll()).toHaveLength(3);
    });
  });

  describe("server restart recovery", () => {
    it("marks running pipelines as interrupted", async () => {
      const running = createPipelineState("p1");
      running.status = "running";
      running.currentStage = "GAME_DESIGN";
      running.stages[2].status = "running";

      const completed = createPipelineState("p2");
      completed.status = "completed";

      await store.save(running);
      await store.save(completed);

      await expect(store.markInterrupted()).resolves.toBe(1);

      const recovered = store.get(running.pipelineId);
      expect(recovered!.status).toBe("failed");
      expect(recovered!.finishedAt).toBeDefined();
      expect(recovered!.stages[2].status).toBe("failed");
      expect(recovered!.stages[2].error).toContain("Interrupted");

      const unchanged = store.get(completed.pipelineId);
      expect(unchanged!.status).toBe("completed");
    });

    it("does not mark non-running pipelines", async () => {
      const failed = createPipelineState("p1");
      failed.status = "failed";
      const paused = createPipelineState("p2");
      paused.status = "paused";

      await store.save(failed);
      await store.save(paused);

      await expect(store.markInterrupted()).resolves.toBe(0);
    });
  });

  describe("durable restart recovery", () => {
    it("reads acknowledged state through a recreated store instance", async () => {
      const storage = new InMemoryStorageProvider();
      const first = new StoragePipelineStore(storage);
      const state = createPipelineState("project-1");
      state.status = "paused";

      await first.save(state);

      const recreated = new StoragePipelineStore(storage);
      expect(recreated.get(state.pipelineId)).toEqual(state);
      expect(recreated.get(state.pipelineId)).not.toBe(state);
    });

    it("marks persisted running pipelines interrupted exactly once", async () => {
      const storage = new InMemoryStorageProvider();
      const writer = new StoragePipelineStore(storage);
      const running = createPipelineState("project-running");
      running.status = "running";
      running.currentStage = "GAME_DESIGN";
      const runningStage = running.stages.find(
        (stage) => stage.name === "GAME_DESIGN",
      );
      if (!runningStage) throw new Error("GAME_DESIGN stage missing");
      runningStage.status = "running";

      const completed = createPipelineState("project-completed");
      completed.status = "completed";
      completed.finishedAt = Date.now();

      await writer.save(running);
      await writer.save(completed);

      const recreated = new StoragePipelineStore(storage);
      await expect(recreated.markInterrupted()).resolves.toBe(1);
      await expect(recreated.markInterrupted()).resolves.toBe(0);

      const interrupted = recreated.get(running.pipelineId);
      expect(interrupted).toMatchObject({
        status: "failed",
        currentStage: null,
      });
      expect(interrupted?.finishedAt).toEqual(expect.any(Number));
      expect(
        interrupted?.stages.find((stage) => stage.name === "GAME_DESIGN"),
      ).toMatchObject({
        status: "failed",
        error: "Interrupted: server restart",
        completedAt: expect.any(Number),
      });
      expect(interrupted?.failedStages).toContain("GAME_DESIGN");
      expect(recreated.get(completed.pipelineId)).toEqual(completed);
    });

    it("preserves exact prior state when recovery persistence rejects", async () => {
      const storage = new RejectingBatchStorage();
      const writer = new StoragePipelineStore(storage);
      const running = createPipelineState("project-1");
      running.status = "running";
      running.currentStage = "REQUIREMENTS";
      const runningStage = running.stages.find(
        (stage) => stage.name === "REQUIREMENTS",
      );
      if (!runningStage) throw new Error("REQUIREMENTS stage missing");
      runningStage.status = "running";

      await writer.save(running);
      const before = structuredClone(writer.get(running.pipelineId));

      await expect(writer.markInterrupted()).rejects.toBeInstanceOf(
        DurableStorageError,
      );
      expect(writer.get(running.pipelineId)).toEqual(before);
    });

    it("deletes state only after durable acknowledgement", async () => {
      const storage = new InMemoryStorageProvider();
      const durableStore = new StoragePipelineStore(storage);
      const state = createPipelineState("project-1");
      await durableStore.save(state);

      await expect(durableStore.delete(state.pipelineId)).resolves.toBe(true);
      expect(durableStore.get(state.pipelineId)).toBeNull();
    });
  });

  describe("failed stage recovery", () => {
    it("preserves error information in failed stages", async () => {
      const state = createPipelineState("p1");
      state.status = "failed";
      state.stages[3].status = "failed";
      state.stages[3].error = "LLM timeout after 30s";
      state.failedStages.push("ARCHITECTURE");

      await store.save(state);

      const retrieved = store.get(state.pipelineId);
      expect(retrieved!.status).toBe("failed");
      expect(retrieved!.stages[3].error).toBe("LLM timeout after 30s");
      expect(retrieved!.failedStages).toContain("ARCHITECTURE");
    });
  });

  describe("duplicate execution prevention", () => {
    it("getByStatus finds running pipelines for a project", async () => {
      const state1 = createPipelineState("project-x");
      state1.status = "running";
      const state2 = createPipelineState("project-y");
      state2.status = "completed";

      await store.save(state1);
      await store.save(state2);

      const running = store.getByStatus("running");
      expect(running).toHaveLength(1);
      expect(running[0].projectId).toBe("project-x");
    });

    it("has() correctly reports existence", async () => {
      const state = createPipelineState("p1");
      await store.save(state);
      expect(store.has(state.pipelineId)).toBe(true);
      expect(store.has("fake-id")).toBe(false);
    });
  });
});
