import { afterEach, describe, expect, it } from "vitest";
import { ApiKeyStore, type StoredApiKey } from "../ApiKeyStore";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../../storage/StorageProvider";

class ControlledMutationStorage extends InMemoryStorageProvider {
  rejectSet = false;
  rejectDelete = false;
  setDurableCalls = 0;
  onSetStart?: () => void;
  setBarrier?: Promise<void>;
  onDeleteStart?: () => void;
  deleteBarrier?: Promise<void>;

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    this.setDurableCalls += 1;
    this.onSetStart?.();
    if (this.setBarrier) {
      await this.setBarrier;
    }
    if (this.rejectSet) {
      throw new DurableStorageError("injected set rejection", "set");
    }
    await super.setDurable(collection, id, data);
  }

  override async deleteDurable(
    collection: string,
    id: string,
  ): Promise<boolean> {
    this.onDeleteStart?.();
    if (this.deleteBarrier) {
      await this.deleteBarrier;
    }
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
    storage.setDurableCalls = 0;
    storage.onSetStart = undefined;
    storage.setBarrier = undefined;
    storage.onDeleteStart = undefined;
    storage.deleteBarrier = undefined;
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
        capabilities: [],
        resourceScopes: [],
      },
    ]);
    const stored = storage.get<StoredApiKey>("platform_api_keys", issued.id);
    expect(stored?.digest).toMatch(
      /^scrypt-v1\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/,
    );
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
        capabilities: [],
        resourceScopes: [],
      },
    ]);
  });

  it("revokes a key after acknowledgement and is idempotent", async () => {
    const issued = await store.issueDurable("revoke-api-key-123456789");

    await expect(store.revokeDurable(issued.id)).resolves.toBe(true);
    expect(store.validate(issued.key)).toBe(false);
    await expect(store.revokeDurable(issued.id)).resolves.toBe(false);
  });

  it("serializes concurrent revocations of the same key", async () => {
    const issued = await store.issueDurable("concurrent-revoke-key-123456789");
    storage.setDurableCalls = 0;
    let markStarted!: () => void;
    let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    storage.onSetStart = markStarted;
    storage.setBarrier = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    const first = store.revokeDurable(issued.id);
    await writeStarted;
    const second = store.revokeDurable(issued.id);
    releaseWrite();

    await expect(Promise.all([first, second])).resolves.toEqual([true, false]);
    expect(storage.setDurableCalls).toBe(1);
    expect(store.list()).toEqual([
      expect.objectContaining({
        id: issued.id,
        revokedAt: expect.any(String),
      }),
    ]);
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

  it("waits for an in-flight issuance before cleanup", async () => {
    let markStarted!: () => void;
    let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    storage.onSetStart = markStarted;
    storage.setBarrier = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    const issuance = store.issueDurable("cleanup-issuance-key-123456789");
    await writeStarted;
    const cleanup = store.clearDurable();
    releaseWrite();

    await expect(issuance).resolves.toEqual({
      id: expect.any(String),
      key: "cleanup-issuance-key-123456789",
    });
    await expect(cleanup).resolves.toBe(1);
    expect(store.list()).toEqual([]);
  });

  it("waits for an in-flight revocation before cleanup", async () => {
    const issued = await store.issueDurable("cleanup-revocation-key-123456789");
    let markStarted!: () => void;
    let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    storage.onSetStart = markStarted;
    storage.setBarrier = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    const revocation = store.revokeDurable(issued.id);
    await writeStarted;
    const cleanup = store.clearDurable();
    releaseWrite();

    await expect(revocation).resolves.toBe(true);
    await expect(cleanup).resolves.toBe(1);
    expect(store.list()).toEqual([]);
  });

  it("waits for cleanup before issuing a replacement key", async () => {
    const id = "cleanup-issuance-race";
    await store.issueDurable("original-cleanup-key-123456789", { id });
    let markStarted!: () => void;
    let releaseDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    storage.onDeleteStart = markStarted;
    storage.deleteBarrier = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });

    const cleanup = store.clearDurable();
    await deleteStarted;
    let issuanceStarted = false;
    storage.onSetStart = () => {
      issuanceStarted = true;
    };
    const replacementPromise = store.issueDurable(
      "replacement-cleanup-key-123456789",
      { id },
    );
    await Promise.resolve();
    expect(issuanceStarted).toBe(false);

    releaseDelete();
    await expect(cleanup).resolves.toBe(1);
    const replacement = await replacementPromise;
    expect(issuanceStarted).toBe(true);
    expect(store.validate(replacement.key)).toBe(true);
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

  it("migrates a matching legacy Studio digest to scrypt during seeding", async () => {
    const key = "legacy-studio-seed-key-123456789";
    const legacyDigest =
      "3b1087ed86e837c8105e89040b030007aca091680ecb894904579330672c125a";
    await storage.setDurable<StoredApiKey>(
      "platform_api_keys",
      "legacy-studio-key",
      {
        id: "legacy-studio-key",
        digest: legacyDigest,
        createdAt: new Date().toISOString(),
        label: "legacy-studio",
        capabilities: ["studio.project.access"],
        resourceScopes: ["project-1"],
      },
    );

    expect(store.resolvePrincipal(key)).toMatchObject({
      type: "api-key",
      keyId: "legacy-studio-key",
      capabilities: ["studio.project.access"],
      resourceScopes: ["project-1"],
    });
    await expect(
      store.seedStudioFromEnvironmentDurable(key, "project-1"),
    ).resolves.toBe(0);

    const migrated = storage.get<StoredApiKey>(
      "platform_api_keys",
      "legacy-studio-key",
    );
    expect(migrated?.digest).toMatch(/^scrypt-v1\$/);
    expect(migrated?.digest).not.toBe(legacyDigest);
    expect(store.validate(key)).toBe(true);
  });

  it("seeds one exact project-scoped Studio key idempotently", async () => {
    const key = "studio-seed-key-123456789";

    await expect(
      store.seedStudioFromEnvironmentDurable(key, "project-1"),
    ).resolves.toBe(1);
    await expect(
      store.seedStudioFromEnvironmentDurable(key, "project-1"),
    ).resolves.toBe(0);
    expect(store.resolvePrincipal(key)).toEqual({
      type: "api-key",
      keyId: expect.stringMatching(/^studio-env-/),
      capabilities: ["studio.project.access"],
      resourceScopes: ["project-1"],
    });
    await expect(
      store.seedStudioFromEnvironmentDurable(key, undefined),
    ).rejects.toThrow(/configured together/);
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
