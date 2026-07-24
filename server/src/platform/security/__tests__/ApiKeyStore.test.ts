import { afterEach, describe, expect, it } from "vitest";
import { ApiKeyStore } from "../ApiKeyStore";
import { InMemoryStorageProvider } from "../../storage/StorageProvider";

describe("ApiKeyStore", () => {
  const storage = new InMemoryStorageProvider();
  const store = new ApiKeyStore(storage);

  afterEach(() => {
    store.clear();
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

  it("revokes a key and is idempotent for repeated revocation", () => {
    const issued = store.issue("revoke-api-key-123456789");

    expect(store.revoke(issued.id)).toBe(true);
    expect(store.validate(issued.key)).toBe(false);
    expect(store.revoke(issued.id)).toBe(false);
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
