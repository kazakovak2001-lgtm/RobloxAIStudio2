import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../../platform/storage/StorageProvider";
import { createPipelineState } from "../PipelineStage";
import { StoragePipelineStore } from "../store/StoragePipelineStore";

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

describe("StoragePipelineStore", () => {
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
    const store = new StoragePipelineStore(storage);
    const state = createPipelineState("project-1");
    await store.save(state);

    await expect(store.delete(state.pipelineId)).resolves.toBe(true);
    expect(store.get(state.pipelineId)).toBeNull();
  });
});
