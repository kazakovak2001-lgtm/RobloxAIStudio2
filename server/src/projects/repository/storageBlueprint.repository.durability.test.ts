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

function seedVersionLifecycle(storage: InMemoryStorageProvider) {
  const blueprint = {
    id: "blueprint-lifecycle",
    project_id: "project-1",
    user_id: "user-1",
    name: "Current blueprint",
    status: "draft",
    version: 2,
    created_at: new Date(100),
    updated_at: new Date(200),
  };
  const versionOne = {
    id: "version-lifecycle-1",
    blueprint_id: blueprint.id,
    version_number: 1,
    created_at: new Date(110),
    created_by: "user-1",
    snapshot: {
      ...blueprint,
      name: "Version one",
      version: 1,
      updated_at: new Date(110),
    },
    is_active: false,
  };
  const versionTwo = {
    id: "version-lifecycle-2",
    blueprint_id: blueprint.id,
    version_number: 2,
    created_at: new Date(210),
    created_by: "user-1",
    snapshot: { ...blueprint },
    is_active: true,
  };

  storage.set(BLUEPRINTS, blueprint.id, blueprint);
  storage.set(VERSIONS, versionOne.id, versionOne);
  storage.set(VERSIONS, versionTwo.id, versionTwo);
  return { blueprint, versionOne, versionTwo };
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

describe("StorageBlueprintRepository version lifecycle", () => {
  it("saves a new version and deactivates the previous active version atomically", async () => {
    const storage = new SpyBatchStorage();
    const records = seedVersionLifecycle(storage);
    const repository = new StorageBlueprintRepository(storage);

    const saved = await repository.saveVersion(
      records.blueprint.id,
      "user-2",
      "checkpoint",
    );
    const versions = storage.list<{
      id: string;
      blueprint_id: string;
      is_active: boolean;
    }>(
      VERSIONS,
      (candidate) => candidate.blueprint_id === records.blueprint.id,
    );

    expect(storage.batchCalls).toBe(1);
    expect(saved.is_active).toBe(true);
    expect(versions.filter((version) => version.is_active)).toHaveLength(1);
    expect(versions.find((version) => version.id === saved.id)?.is_active).toBe(
      true,
    );
    expect(
      versions.find((version) => version.id === records.versionTwo.id)
        ?.is_active,
    ).toBe(false);
  });

  it("preserves active version state when save batch rejects", async () => {
    const storage = new RejectingBatchStorage();
    const records = seedVersionLifecycle(storage);
    const repository = new StorageBlueprintRepository(storage);
    const priorVersions = structuredClone(storage.list(VERSIONS));

    await expect(
      repository.saveVersion(records.blueprint.id, "user-2"),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.list(VERSIONS)).toEqual(priorVersions);
  });

  it("restores the blueprint and active marker in one durable batch", async () => {
    const storage = new SpyBatchStorage();
    const records = seedVersionLifecycle(storage);
    const repository = new StorageBlueprintRepository(storage);

    const restored = await repository.restoreVersion(records.blueprint.id, 1);
    const versions = storage.list<{
      id: string;
      blueprint_id: string;
      is_active: boolean;
    }>(
      VERSIONS,
      (candidate) => candidate.blueprint_id === records.blueprint.id,
    );

    expect(storage.batchCalls).toBe(1);
    expect(restored).toMatchObject({
      id: records.blueprint.id,
      name: "Version one",
      version: 3,
    });
    expect(versions.filter((version) => version.is_active)).toEqual([
      expect.objectContaining({ id: records.versionOne.id }),
    ]);
  });

  it("preserves blueprint and version markers when restore batch rejects", async () => {
    const storage = new RejectingBatchStorage();
    const records = seedVersionLifecycle(storage);
    const repository = new StorageBlueprintRepository(storage);
    const priorBlueprint = structuredClone(
      storage.get(BLUEPRINTS, records.blueprint.id),
    );
    const priorVersions = structuredClone(storage.list(VERSIONS));

    await expect(
      repository.restoreVersion(records.blueprint.id, 1),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get(BLUEPRINTS, records.blueprint.id)).toEqual(
      priorBlueprint,
    );
    expect(storage.list(VERSIONS)).toEqual(priorVersions);
  });

  it("hydrates persisted ISO dates while restoring a version", async () => {
    const storage = new SpyBatchStorage();
    const records = seedVersionLifecycle(storage);
    storage.set(BLUEPRINTS, records.blueprint.id, {
      ...records.blueprint,
      created_at: new Date(100).toISOString(),
      updated_at: new Date(200).toISOString(),
    });
    storage.set(VERSIONS, records.versionOne.id, {
      ...records.versionOne,
      created_at: new Date(110).toISOString(),
      snapshot: {
        ...records.versionOne.snapshot,
        created_at: new Date(100).toISOString(),
        updated_at: new Date(110).toISOString(),
      },
    });
    const repository = new StorageBlueprintRepository(storage);

    const restored = await repository.restoreVersion(records.blueprint.id, 1);

    expect(restored?.created_at).toBeInstanceOf(Date);
    expect(restored?.updated_at).toBeInstanceOf(Date);
    expect(
      storage.get<{ created_at: unknown }>(VERSIONS, records.versionOne.id)
        ?.created_at,
    ).toBeInstanceOf(Date);
  });
});
