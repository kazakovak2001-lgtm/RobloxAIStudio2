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
    const issued = await store.issueDurable(
      "rai_0000000000000001_11111111111111111111111111111111",
      {
        label: "test",
        ownerId: "user-1",
      },
    );

    await expect(store.validate(issued.key)).resolves.toBe(true);
    await expect(
      store.validate("rai_00000000000000ff_ffffffffffffffffffffffffffffffff"),
    ).resolves.toBe(false);
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
    expect(stored?.lookupId).toBe("0000000000000001");
    expect(JSON.stringify(storage.list("platform_api_keys"))).not.toContain(
      issued.key,
    );
  });

  it("does not publish an issued key when persistence is rejected", async () => {
    storage.rejectSet = true;

    await expect(
      store.issueDurable(
        "rai_0000000000000002_22222222222222222222222222222222",
        {
          id: "rejected-issue",
          label: "rejected",
        },
      ),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    await expect(
      store.validate("rai_0000000000000002_22222222222222222222222222222222"),
    ).resolves.toBe(false);
    expect(storage.get("platform_api_keys", "rejected-issue")).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("rejects an active duplicate lookup ID before expensive verification", async () => {
    await store.issueDurable(
      "rai_000000000000001b_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );

    await expect(
      store.issueDurable(
        "rai_000000000000001b_cccccccccccccccccccccccccccccccc",
      ),
    ).rejects.toThrow(/lookup ID is already active/);
  });
  it("generates a key only after persistence acknowledgement", async () => {
    const issued = await store.generateDurable({ label: "generated" });

    expect(issued.key).toMatch(/^rai_[0-9a-f]{16}_[0-9a-f]{64}$/);
    await expect(store.validate(issued.key)).resolves.toBe(true);
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
    const issued = await store.issueDurable(
      "rai_0000000000000003_33333333333333333333333333333333",
    );

    await expect(store.revokeDurable(issued.id)).resolves.toBe(true);
    await expect(store.validate(issued.key)).resolves.toBe(false);
    await expect(store.revokeDurable(issued.id)).resolves.toBe(false);
  });

  it("serializes concurrent revocations of the same key", async () => {
    const issued = await store.issueDurable(
      "rai_0000000000000004_44444444444444444444444444444444",
    );
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
    const issued = await store.issueDurable(
      "rai_0000000000000005_55555555555555555555555555555555",
    );
    const previous = storage.get("platform_api_keys", issued.id);
    storage.rejectSet = true;

    await expect(store.revokeDurable(issued.id)).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    await expect(store.validate(issued.key)).resolves.toBe(true);
    expect(storage.get("platform_api_keys", issued.id)).toEqual(previous);
  });

  it("deletes all keys only after individual acknowledgements", async () => {
    await store.issueDurable(
      "rai_0000000000000006_66666666666666666666666666666666",
    );
    await store.issueDurable(
      "rai_0000000000000007_77777777777777777777777777777777",
    );

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

    const issuance = store.issueDurable(
      "rai_0000000000000008_88888888888888888888888888888888",
    );
    await writeStarted;
    const cleanup = store.clearDurable();
    releaseWrite();

    await expect(issuance).resolves.toEqual({
      id: expect.any(String),
      key: "rai_0000000000000008_88888888888888888888888888888888",
    });
    await expect(cleanup).resolves.toBe(1);
    expect(store.list()).toEqual([]);
  });

  it("waits for an in-flight revocation before cleanup", async () => {
    const issued = await store.issueDurable(
      "rai_0000000000000009_99999999999999999999999999999999",
    );
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
    await store.issueDurable(
      "rai_000000000000000a_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      { id },
    );
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
      "rai_000000000000000b_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      { id },
    );
    await Promise.resolve();
    expect(issuanceStarted).toBe(false);

    releaseDelete();
    await expect(cleanup).resolves.toBe(1);
    const replacement = await replacementPromise;
    expect(issuanceStarted).toBe(true);
    await expect(store.validate(replacement.key)).resolves.toBe(true);
  });

  it("retains a key when cleanup persistence is rejected", async () => {
    const issued = await store.issueDurable(
      "rai_000000000000000c_cccccccccccccccccccccccccccccccc",
    );
    const previous = storage.get("platform_api_keys", issued.id);
    storage.rejectDelete = true;

    await expect(store.clearDurable()).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "delete",
    });
    await expect(store.validate(issued.key)).resolves.toBe(true);
    expect(storage.get("platform_api_keys", issued.id)).toEqual(previous);
  });

  it("rejects malformed or short credentials", async () => {
    await expect(store.validate(undefined)).resolves.toBe(false);
    await expect(
      store.validate(["rai_0000000000000001_11111111111111111111111111111111"]),
    ).resolves.toBe(false);
    await expect(store.issueDurable("too-short")).rejects.toThrow(
      /must use rai_/,
    );
  });

  it("rejects legacy SHA-256 digests and safely reseeds the Studio key", async () => {
    const key = "rai_000000000000000d_dddddddddddddddddddddddddddddddd";
    const legacyDigest =
      "3b1087ed86e837c8105e89040b030007aca091680ecb894904579330672c125a";
    await storage.setDurable<StoredApiKey>(
      "platform_api_keys",
      "legacy-studio-key",
      {
        id: "legacy-studio-key",
        lookupId: "000000000000000d",
        digest: legacyDigest,
        createdAt: new Date().toISOString(),
        label: "legacy-studio",
        capabilities: ["studio.project.access"],
        resourceScopes: ["project-1"],
      },
    );

    expect(await store.resolvePrincipal(key)).toBeNull();
    await expect(
      store.seedStudioFromEnvironmentDurable(key, "project-1"),
    ).resolves.toBe(1);

    const legacy = storage.get<StoredApiKey>(
      "platform_api_keys",
      "legacy-studio-key",
    );
    expect(legacy?.digest).toBe(legacyDigest);
    expect(await store.resolvePrincipal(key)).toMatchObject({
      type: "api-key",
      keyId: expect.stringMatching(/^studio-env-/),
      capabilities: ["studio.project.access"],
      resourceScopes: ["project-1"],
    });
  });

  it("seeds one exact project-scoped Studio key idempotently", async () => {
    const key = "rai_000000000000000e_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    await expect(
      store.seedStudioFromEnvironmentDurable(key, "project-1"),
    ).resolves.toBe(1);
    await expect(
      store.seedStudioFromEnvironmentDurable(key, "project-1"),
    ).resolves.toBe(0);
    expect(await store.resolvePrincipal(key)).toEqual({
      type: "api-key",
      keyId: expect.stringMatching(/^studio-env-/),
      capabilities: ["studio.project.access"],
      resourceScopes: ["project-1"],
    });
    await expect(
      store.seedStudioFromEnvironmentDurable(key, undefined),
    ).rejects.toThrow(/configured together/);
  });

  it("revokes superseded environment-managed Studio keys during rotation", async () => {
    const previous = "rai_0000000000000018_18181818181818181818181818181818";
    const replacement = "rai_0000000000000019_19191919191919191919191919191919";

    await expect(
      store.seedStudioFromEnvironmentDurable(previous, "project-1"),
    ).resolves.toBe(1);
    await expect(
      store.seedStudioFromEnvironmentDurable(replacement, "project-1"),
    ).resolves.toBe(1);

    await expect(store.validate(previous)).resolves.toBe(false);
    await expect(store.validate(replacement)).resolves.toBe(true);
    const records = store
      .list()
      .filter((record) => record.label === "studio-environment");
    expect(records).toHaveLength(2);
    expect(records.filter((record) => record.revokedAt)).toHaveLength(1);
    expect(records.filter((record) => !record.revokedAt)).toHaveLength(1);
  });

  it("revokes environment-managed Studio keys when configuration is removed", async () => {
    const key = "rai_000000000000001a_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";

    await expect(
      store.seedStudioFromEnvironmentDurable(key, "project-1"),
    ).resolves.toBe(1);
    await expect(store.seedStudioFromEnvironmentDurable("", "")).resolves.toBe(
      1,
    );
    await expect(store.validate(key)).resolves.toBe(false);
    await expect(store.seedStudioFromEnvironmentDurable("", "")).resolves.toBe(
      0,
    );
  });
  it("seeds unique keys from API_KEYS without duplicating records", async () => {
    const value =
      "rai_0000000000000010_10101010101010101010101010101010, rai_0000000000000010_10101010101010101010101010101010, rai_0000000000000011_11111111111111111111111111111112";

    await expect(store.seedFromEnvironmentDurable(value)).resolves.toBe(2);
    await expect(store.seedFromEnvironmentDurable(value)).resolves.toBe(0);
    await expect(
      store.validate("rai_0000000000000010_10101010101010101010101010101010"),
    ).resolves.toBe(true);
    await expect(
      store.validate("rai_0000000000000011_11111111111111111111111111111112"),
    ).resolves.toBe(true);
    expect(store.list()).toHaveLength(2);
  });
});
