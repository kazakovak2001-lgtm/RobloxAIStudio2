import { afterEach, describe, expect, it } from "vitest";
import { ApiKeyStore } from "../ApiKeyStore";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../../storage/StorageProvider";

class ControlledMutationStorage extends InMemoryStorageProvider {
  rejectSet = false;
  rejectDelete = false;

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    if (this.rejectSet) {
      throw new DurableStorageError("injected set rejection", "set");
    }
    await super.setDurable(collection, id, data);
  }

  override async deleteDurable(
    collection: string,
    id: string,
  ): Promise<boolean> {
    if (this.rejectDelete) {
      throw new DurableStorageError("injected delete rejection", "delete");
    }
    return super.deleteDurable(collection, id);
  }
}

describe("ApiKeyStore", () => {
  const storage = new ControlledMutationStorage();
  const store = new ApiKeyStore(storage);

  afterEach(async () => {
    storage.rejectSet = false;
    storage.rejectDelete = false;
    await store.clearDurable();
  });

  it("validates an issued key without storing the plain-text credential", () => {
    const issued = store.issue("test-api-key-123456789", {
      label: "test",
      ownerId: "user-1",
    });

    expect(store.validate(issued.key)).toBe(true);
    expect(store.validate("unknown-api-key-123456789")).toBe(false);
    expect(store.list()).toEqual([
      {
        id: issued.id,
        createdAt: expect.any(String),
        label: "test",
        ownerId: "user-1",
      },
    ]);
    expect(JSON.stringify(storage.list("platform_api_keys"))).not.toContain(
      issued.key,
    );
  });

  it("revokes a key after acknowledgement and is idempotent", async () => {
    const issued = store.issue("revoke-api-key-123456789");

    await expect(store.revokeDurable(issued.id)).resolves.toBe(true);
    expect(store.validate(issued.key)).toBe(false);
    await expect(store.revokeDurable(issued.id)).resolves.toBe(false);
  });

  it("keeps a key valid when revocation persistence is rejected", async () => {
    const issued = store.issue("rejected-revoke-key-123456789");
    const previous = storage.get("platform_api_keys", issued.id);
    storage.rejectSet = true;

    await expect(store.revokeDurable(issued.id)).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(store.validate(issued.key)).toBe(true);
    expect(storage.get("platform_api_keys", issued.id)).toEqual(previous);
  });

  it("deletes all keys only after individual acknowledgements", async () => {
    store.issue("cleanup-api-key-one-123456789");
    store.issue("cleanup-api-key-two-123456789");

    await expect(store.clearDurable()).resolves.toBe(2);
    expect(store.list()).toEqual([]);
  });

  it("retains a key when cleanup persistence is rejected", async () => {
    const issued = store.issue("rejected-cleanup-key-123456789");
    const previous = storage.get("platform_api_keys", issued.id);
    storage.rejectDelete = true;

    await expect(store.clearDurable()).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "delete",
    });
    expect(store.validate(issued.key)).toBe(true);
    expect(storage.get("platform_api_keys", issued.id)).toEqual(previous);
  });

  it("rejects malformed or short credentials", () => {
    expect(store.validate(undefined)).toBe(false);
    expect(store.validate(["test-api-key-123456789"])).toBe(false);
    expect(() => store.issue("too-short")).toThrow(/at least 16/);
  });

  it("seeds unique keys from API_KEYS without duplicating records", () => {
    const value =
      "seed-api-key-123456789, seed-api-key-123456789, another-seed-api-key-123456";

    expect(store.seedFromEnvironment(value)).toBe(2);
    expect(store.seedFromEnvironment(value)).toBe(0);
    expect(store.validate("seed-api-key-123456789")).toBe(true);
    expect(store.validate("another-seed-api-key-123456")).toBe(true);
    expect(store.list()).toHaveLength(2);
  });
});
