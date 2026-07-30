import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../platform/storage/StorageProvider";
import { StorageBlueprintRepository } from "./storageBlueprint.repository";

const BLUEPRINTS = "game_blueprints";
const VERSIONS = "blueprint_versions";
const EXECUTIONS = "generation_executions";

function seedAggregate(storage: InMemoryStorageProvider) {
  const blueprint = {
    id: "blueprint-1",
    project_id: "project-1",
    metadata: { exact: true },
  };
  const versionOne = {
    id: "version-1",
    blueprint_id: blueprint.id,
    snapshot: { version: 1 },
  };
  const versionTwo = {
    id: "version-2",
    blueprint_id: blueprint.id,
    snapshot: { version: 2 },
  };
  const execution = {
    id: "execution-1",
    blueprint_id: blueprint.id,
    state: { status: "completed" },
  };
  const unrelatedVersion = {
    id: "version-other",
    blueprint_id: "blueprint-other",
  };

  storage.set(BLUEPRINTS, blueprint.id, blueprint);
  storage.set(VERSIONS, versionOne.id, versionOne);
  storage.set(VERSIONS, versionTwo.id, versionTwo);
  storage.set(EXECUTIONS, execution.id, execution);
  storage.set(VERSIONS, unrelatedVersion.id, unrelatedVersion);

  return { blueprint, versionOne, versionTwo, execution, unrelatedVersion };
}

class SpyBatchStorage extends InMemoryStorageProvider {
  batchCalls = 0;

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    this.batchCalls += 1;
    return super.applyDurableBatch(mutations);
  }
}

class DeferredBatchStorage extends InMemoryStorageProvider {
  received: readonly DurableMutation[] = [];
  private acknowledge!: () => void;
  private readonly acknowledged = new Promise<void>((resolve) => {
    this.acknowledge = resolve;
  });

  release(): void {
    this.acknowledge();
  }

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    this.received = mutations;
    await this.acknowledged;
    return super.applyDurableBatch(mutations);
  }
}

class RejectingBatchStorage extends InMemoryStorageProvider {
  override async applyDurableBatch(
    _mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    throw new DurableStorageError(
      "Injected blueprint cascade rejection",
      "transaction",
    );
  }
}

describe("StorageBlueprintRepository durable deletion", () => {
  it("deletes the complete blueprint aggregate in one durable batch", async () => {
    const storage = new SpyBatchStorage();
    const records = seedAggregate(storage);
    const repository = new StorageBlueprintRepository(storage);

    await expect(
      repository.deleteBlueprint(records.blueprint.id),
    ).resolves.toBe(true);

    expect(storage.batchCalls).toBe(1);
    expect(storage.get(BLUEPRINTS, records.blueprint.id)).toBeNull();
    expect(storage.get(VERSIONS, records.versionOne.id)).toBeNull();
    expect(storage.get(VERSIONS, records.versionTwo.id)).toBeNull();
    expect(storage.get(EXECUTIONS, records.execution.id)).toBeNull();
    expect(storage.get(VERSIONS, records.unrelatedVersion.id)).toBe(
      records.unrelatedVersion,
    );
  });

  it("does not start a batch for a missing blueprint", async () => {
    const storage = new SpyBatchStorage();
    const repository = new StorageBlueprintRepository(storage);

    await expect(repository.deleteBlueprint("missing")).resolves.toBe(false);
    expect(storage.batchCalls).toBe(0);
  });

  it("keeps the aggregate visible until the batch is acknowledged", async () => {
    const storage = new DeferredBatchStorage();
    const records = seedAggregate(storage);
    const repository = new StorageBlueprintRepository(storage);

    const deletion = repository.deleteBlueprint(records.blueprint.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(storage.get(BLUEPRINTS, records.blueprint.id)).toBe(
      records.blueprint,
    );
    expect(storage.get(VERSIONS, records.versionOne.id)).toBe(
      records.versionOne,
    );
    expect(storage.get(EXECUTIONS, records.execution.id)).toBe(
      records.execution,
    );
    expect(
      storage.received.map((mutation) => [mutation.collection, mutation.id]),
    ).toEqual([
      [VERSIONS, records.versionOne.id],
      [VERSIONS, records.versionTwo.id],
      [EXECUTIONS, records.execution.id],
      [BLUEPRINTS, records.blueprint.id],
    ]);

    storage.release();
    await expect(deletion).resolves.toBe(true);
    expect(storage.get(BLUEPRINTS, records.blueprint.id)).toBeNull();
  });

  it("serializes child writes with deletion and prevents orphan recreation", async () => {
    const storage = new DeferredBatchStorage();
    const records = seedAggregate(storage);
    const repository = new StorageBlueprintRepository(storage);

    const deletion = repository.deleteBlueprint(records.blueprint.id);
    await Promise.resolve();
    await Promise.resolve();

    let versionWriteSettled = false;
    const versionWrite = repository
      .saveVersion(records.blueprint.id, "user-1", "concurrent write")
      .finally(() => {
        versionWriteSettled = true;
      });

    await Promise.resolve();
    await Promise.resolve();
    expect(versionWriteSettled).toBe(false);

    storage.release();
    await expect(deletion).resolves.toBe(true);
    await expect(versionWrite).rejects.toThrow(
      `Blueprint ${records.blueprint.id} not found`,
    );

    expect(
      storage.list(
        VERSIONS,
        (candidate: { blueprint_id?: string }) =>
          candidate.blueprint_id === records.blueprint.id,
      ),
    ).toEqual([]);
  });

  it("preserves the exact aggregate when the durable batch rejects", async () => {
    const storage = new RejectingBatchStorage();
    const records = seedAggregate(storage);
    const repository = new StorageBlueprintRepository(storage);

    await expect(
      repository.deleteBlueprint(records.blueprint.id),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get(BLUEPRINTS, records.blueprint.id)).toBe(
      records.blueprint,
    );
    expect(storage.get(VERSIONS, records.versionOne.id)).toBe(
      records.versionOne,
    );
    expect(storage.get(VERSIONS, records.versionTwo.id)).toBe(
      records.versionTwo,
    );
    expect(storage.get(EXECUTIONS, records.execution.id)).toBe(
      records.execution,
    );
  });
});
