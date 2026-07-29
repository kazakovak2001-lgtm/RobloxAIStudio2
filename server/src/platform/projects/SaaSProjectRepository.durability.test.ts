import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../storage/StorageProvider";
import { SaaSProjectRepository } from "./SaaSProjectRepository";

class DeferredSetStorage extends InMemoryStorageProvider {
  calls = 0;
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
    this.calls += 1;
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
      "Injected project duplication rejection",
      "set",
    );
  }
}

describe("SaaSProjectRepository durable duplication", () => {
  it("returns null without writing when the source project is missing", async () => {
    const storage = new DeferredSetStorage();
    const repository = new SaaSProjectRepository(storage);

    await expect(repository.duplicate("missing")).resolves.toBeNull();
    expect(storage.calls).toBe(0);
  });

  it("does not publish the copy before acknowledgement", async () => {
    const storage = new DeferredSetStorage();
    const sourceRepository = new SaaSProjectRepository(storage);
    storage.set("projects", "source", {
      id: "source",
      ownerId: "owner-1",
      name: "Original",
      description: "Description",
      genre: "adventure",
      status: "draft",
      qualityScore: 0,
      generationCount: 0,
      scriptCount: 0,
      assetCount: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    const duplication = sourceRepository.duplicate("source", "owner-2");
    await Promise.resolve();
    await Promise.resolve();

    expect(sourceRepository.getByOwner("owner-2")).toEqual([]);

    storage.release();
    const copy = await duplication;
    expect(copy).not.toBeNull();
    expect(sourceRepository.get(copy!.id)).toBe(copy);
  });

  it("preserves only the source project when persistence rejects", async () => {
    const storage = new RejectingSetStorage();
    const repository = new SaaSProjectRepository(storage);
    const source = {
      id: "source",
      ownerId: "owner-1",
      name: "Original",
      description: "Description",
      genre: "adventure",
      status: "draft" as const,
      qualityScore: 0,
      generationCount: 0,
      scriptCount: 0,
      assetCount: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    storage.set("projects", source.id, source);

    await expect(repository.duplicate(source.id)).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(repository.get(source.id)).toBe(source);
    expect(repository.getByOwner(source.ownerId)).toEqual([source]);
  });

  it("publishes an acknowledged copy with the requested owner", async () => {
    const storage = new InMemoryStorageProvider();
    const repository = new SaaSProjectRepository(storage);
    const source = await repository.createDurable(
      "owner-1",
      "Original",
      "adventure",
      "Description",
    );

    const copy = await repository.duplicate(source.id, "owner-2");

    expect(copy).toEqual(
      expect.objectContaining({
        ownerId: "owner-2",
        name: "Original (copy)",
        genre: "adventure",
        description: "Description",
      }),
    );
    expect(repository.get(copy!.id)).toBe(copy);
  });
});
