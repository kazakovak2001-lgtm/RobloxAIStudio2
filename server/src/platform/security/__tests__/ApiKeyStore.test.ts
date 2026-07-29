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

  it("validates an issued key without storing the plain-text credential", async () => {
    const issued = await store.issueDurable("test-api-key-123456789", {
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

  it("does not publish an issued key when persistence is rejected", async () => {
    storage.rejectSet = true;

    await expect(
      store.issueDurable("rejected-issue-key-123456789", {
        id: "rejected-issue",
        label: "rejected",
      }),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(store.validate("rejected-issue-key-123456789")).toBe(false);
    expect(storage.get("platform_api_keys", "rejected-issue")).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("generates a key only after persistence acknowledgement", async () => {
    const issued = await store.generateDurable({ label: "generated" });

    expect(issued.key).toMatch(/^rai_[0-9a-f]{64}$/);
    expect(store.validate(issued.key)).toBe(true);
    expect(store.list()).toEqual([
      {
        id: issued.id,
        createdAt: expect.any(String),
        label: "generated",
      },
    ]);
  });

  it("revokes a key after acknowledgement and is idempotent", async () => {
    const issued = await store.issueDurable("revoke-api-key-123456789");

    await expect(store.revokeDurable(issued.id)).resolves.toBe(true);
    expect(store.validate(issued.key)).toBe(false);
    await expect(store.revokeDurable(issued.id)).resolves.toBe(false);
  });

  it("keeps a key valid when revocation persistence is rejected", async () => {
    const issued = await store.issueDurable("rejected-revoke-key-123456789");
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
    await store.issueDurable("cleanup-api-key-one-123456789");
    await store.issueDurable("cleanup-api-key-two-123456789");

    await expect(store.clearDurable()).resolves.toBe(2);
    expect(store.list()).toEqual([]);
  });

  it("retains a key when cleanup persistence is rejected", async () => {
    const issued = await store.issueDurable("rejected-cleanup-key-123456789");
    const previous = storage.get("platform_api_keys", issued.id);
    storage.rejectDelete = true;

    await expect(store.clearDurable()).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "delete",
    });
    expect(store.validate(issued.key)).toBe(true);
    expect(storage.get("platform_api_keys", issued.id)).toEqual(previous);
  });

  it("rejects malformed or short credentials", async () => {
    expect(store.validate(undefined)).toBe(false);
    expect(store.validate(["test-api-key-123456789"])).toBe(false);
    await expect(store.issueDurable("too-short")).rejects.toThrow(
      /at least 16/,
    );
  });

  it("seeds unique keys from API_KEYS without duplicating records", async () => {
    const value =
      "seed-api-key-123456789, seed-api-key-123456789, another-seed-api-key-123456";

    await expect(store.seedFromEnvironmentDurable(value)).resolves.toBe(2);
    await expect(store.seedFromEnvironmentDurable(value)).resolves.toBe(0);
    expect(store.validate("seed-api-key-123456789")).toBe(true);
    expect(store.validate("another-seed-api-key-123456")).toBe(true);
    expect(store.list()).toHaveLength(2);
  });
});
