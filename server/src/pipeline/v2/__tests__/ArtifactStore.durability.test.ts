import { describe, expect, it } from "vitest";
import {
  ArtifactStore,
  type PipelineArtifact,
} from "../ArtifactStore";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../../../platform/storage/StorageProvider";

class ControlledMutationStorage extends InMemoryStorageProvider {
  rejectSet = false;
  private nextSetGate?: Promise<void>;

  deferNextSet(): () => void {
    let release!: () => void;
    this.nextSetGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    if (this.rejectSet) {
      throw new DurableStorageError("injected artifact write rejection", "set");
    }

    const gate = this.nextSetGate;
    this.nextSetGate = undefined;
    if (gate) await gate;
    await super.setDurable(collection, id, data);
  }
}

describe("ArtifactStore durable mutation boundaries", () => {
  it("does not publish a new artifact when persistence is rejected", async () => {
    const storage = new ControlledMutationStorage();
    const store = new ArtifactStore(storage);
    storage.rejectSet = true;

    await expect(
      store.store("pipeline-rejected", "REQUIREMENTS", "requirements", {
        requirements: ["durable"],
      }),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });

    expect(store.count).toBe(0);
    expect(store.getByPipeline("pipeline-rejected")).toEqual([]);
    expect(storage.count("pipeline_artifacts")).toBe(0);
  });

  it("publishes a new artifact only after persistence acknowledgement", async () => {
    const storage = new ControlledMutationStorage();
    const store = new ArtifactStore(storage);
    const release = storage.deferNextSet();

    const pending = store.store(
      "pipeline-pending",
      "REQUIREMENTS",
      "requirements",
      { requirements: ["acknowledged"] },
    );
    await Promise.resolve();

    expect(store.count).toBe(0);
    expect(store.getByPipeline("pipeline-pending")).toEqual([]);

    release();
    const artifact = await pending;

    expect(store.count).toBe(1);
    expect(store.getByPipeline("pipeline-pending")).toEqual([artifact]);
    expect(storage.get("pipeline_artifacts", artifact.id)).toEqual(artifact);
  });

  it("preserves the exact visible artifact when approval is rejected", async () => {
    const storage = new ControlledMutationStorage();
    const store = new ArtifactStore(storage);
    const artifact = await store.store(
      "pipeline-approval-rejected",
      "VALIDATION",
      "validator",
      { passed: true },
    );
    const visibleBefore = structuredClone(store.getById(artifact.id));
    const persistedBefore = structuredClone(
      storage.get<PipelineArtifact>("pipeline_artifacts", artifact.id),
    );
    storage.rejectSet = true;

    await expect(store.approve(artifact.id, "reviewer")).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });

    expect(store.getById(artifact.id)).toEqual(visibleBefore);
    expect(storage.get("pipeline_artifacts", artifact.id)).toEqual(
      persistedBefore,
    );
  });

  it("publishes approval only after persistence acknowledgement", async () => {
    const storage = new ControlledMutationStorage();
    const store = new ArtifactStore(storage);
    const artifact = await store.store(
      "pipeline-approval-pending",
      "VALIDATION",
      "validator",
      { passed: true },
    );
    const visibleBefore = structuredClone(store.getById(artifact.id));
    const release = storage.deferNextSet();

    const pending = store.approve(artifact.id, "reviewer");
    await Promise.resolve();

    expect(store.getById(artifact.id)).toEqual(visibleBefore);

    release();
    const approved = await pending;

    expect(approved).toMatchObject({
      id: artifact.id,
      reviewStatus: "approved",
      reviewedBy: "reviewer",
      validated: true,
    });
    expect(store.getById(artifact.id)).toEqual(approved);
    expect(storage.get("pipeline_artifacts", artifact.id)).toEqual(approved);
  });
});
