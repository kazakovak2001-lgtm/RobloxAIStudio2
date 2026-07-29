import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../../platform/storage/StorageProvider";
import {
  StorageGenerationHistoryRepository,
  type GenerationRecord,
} from "./generationHistory.repository";

const COLLECTION = "generation_history";

function record(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  return {
    id: "run-1",
    projectId: "project-1",
    pipelineId: "pipeline-1",
    status: "running",
    startedAt: 100,
    stagesCompleted: 1,
    stagesTotal: 3,
    failures: 0,
    tokenUsage: 0,
    aiCost: 0,
    ...overrides,
  };
}

class DeferredSetStorage extends InMemoryStorageProvider {
  private acknowledge!: () => void;
  private readonly acknowledged = new Promise<void>((resolve) => {
    this.acknowledge = resolve;
  });

  release(): void {
    this.acknowledge();
  }

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    await this.acknowledged;
    await super.setDurable(collection, id, data);
  }
}

class RejectingSetStorage extends InMemoryStorageProvider {
  override async setDurable<T>(
    _collection: string,
    _id: string,
    _data: T,
  ): Promise<void> {
    throw new DurableStorageError(
      "Injected generation history rejection",
      "set",
    );
  }
}

describe("StorageGenerationHistoryRepository durable recording", () => {
  it("does not publish a pending record before acknowledgement", async () => {
    const storage = new DeferredSetStorage();
    const repository = new StorageGenerationHistoryRepository(storage);
    const entry = record();

    const mutation = repository.record(entry);
    await Promise.resolve();
    await Promise.resolve();

    expect(repository.getByPipeline(entry.pipelineId)).toBeNull();
    expect(storage.count(COLLECTION)).toBe(0);

    storage.release();
    await mutation;
    expect(repository.getByPipeline(entry.pipelineId)).toBe(entry);
  });

  it("does not publish a rejected create", async () => {
    const storage = new RejectingSetStorage();
    const repository = new StorageGenerationHistoryRepository(storage);
    const entry = record();

    await expect(repository.record(entry)).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(repository.getByPipeline(entry.pipelineId)).toBeNull();
  });

  it("preserves the exact previous record after a rejected update", async () => {
    const storage = new RejectingSetStorage();
    const previous = record();
    storage.set(COLLECTION, previous.pipelineId, previous);
    const repository = new StorageGenerationHistoryRepository(storage);
    const updated = record({
      status: "completed",
      finishedAt: 200,
      duration: 100,
      stagesCompleted: 3,
    });

    await expect(repository.record(updated)).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(repository.getByPipeline(previous.pipelineId)).toBe(previous);
  });

  it("publishes a successful record immediately after acknowledgement", async () => {
    const storage = new InMemoryStorageProvider();
    const repository = new StorageGenerationHistoryRepository(storage);
    const entry = record({ status: "completed" });

    await repository.record(entry);

    expect(repository.getByPipeline(entry.pipelineId)).toBe(entry);
    expect(repository.getByProject(entry.projectId)).toEqual([entry]);
  });
});
