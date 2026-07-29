import { describe, expect, it } from "vitest";
import { DurableStorageError } from "../StorageProvider";
import {
  PostgresStorageProvider,
  type QueryablePool,
} from "./PostgresStorageProvider";

interface FakePoolOptions {
  rows?: Array<Record<string, unknown>>;
  reject?: "insert" | "delete";
}

function fakePool(options: FakePoolOptions = {}): QueryablePool {
  return {
    async query(text: string) {
      if (options.reject === "insert" && text.includes("INSERT INTO")) {
        throw new Error("injected insert rejection");
      }
      if (options.reject === "delete" && text.includes("DELETE FROM")) {
        throw new Error("injected delete rejection");
      }
      if (text.includes("SELECT collection, id, data")) {
        return { rows: options.rows ?? [] };
      }
      return { rows: [] };
    },
    async end() {},
  };
}

function provider(options: FakePoolOptions = {}): PostgresStorageProvider {
  return new PostgresStorageProvider(
    {
      connectionString: "postgresql://test",
      poolSize: 1,
      poolTimeout: 1000,
      strict: true,
    },
    { createPool: () => fakePool(options) },
  );
}

describe("PostgresStorageProvider awaited mutations", () => {
  it("does not expose a rejected create in the read cache", async () => {
    const storage = provider({ reject: "insert" });
    await storage.ready();

    await expect(
      storage.setDurable("projects", "project-new", { name: "New" }),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get("projects", "project-new")).toBeNull();
    expect(storage.count("projects")).toBe(0);
  });

  it("retains the exact previous cache value after a rejected update", async () => {
    const previous = { name: "Before", version: 1 };
    const storage = provider({
      rows: [{ collection: "projects", id: "project-1", data: previous }],
      reject: "insert",
    });
    await storage.ready();

    await expect(
      storage.setDurable("projects", "project-1", {
        name: "After",
        version: 2,
      }),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get("projects", "project-1")).toEqual(previous);
  });

  it("retains the cached record after a rejected delete", async () => {
    const previous = { name: "Keep me" };
    const storage = provider({
      rows: [{ collection: "projects", id: "project-1", data: previous }],
      reject: "delete",
    });
    await storage.ready();

    await expect(
      storage.deleteDurable("projects", "project-1"),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get("projects", "project-1")).toEqual(previous);
  });

  it("does not publish a pending write before database acknowledgement", async () => {
    let acknowledgeInsert: (() => void) | undefined;
    const insertAcknowledged = new Promise<void>((resolve) => {
      acknowledgeInsert = resolve;
    });
    const pool: QueryablePool = {
      async query(text: string) {
        if (text.includes("SELECT collection, id, data")) return { rows: [] };
        if (text.includes("INSERT INTO")) await insertAcknowledged;
        return { rows: [] };
      },
      async end() {},
    };
    const storage = new PostgresStorageProvider(
      {
        connectionString: "postgresql://test",
        poolSize: 1,
        poolTimeout: 1000,
        strict: true,
      },
      { createPool: () => pool },
    );
    await storage.ready();

    const mutation = storage.setDurable("projects", "project-pending", {
      name: "Pending",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(storage.get("projects", "project-pending")).toBeNull();

    acknowledgeInsert?.();
    await mutation;
    expect(storage.get("projects", "project-pending")).toEqual({
      name: "Pending",
    });
  });

  it("publishes successful mutations only after acknowledgement", async () => {
    const storage = provider();
    await storage.ready();

    await storage.setDurable("projects", "project-1", { name: "Committed" });
    expect(storage.get("projects", "project-1")).toEqual({
      name: "Committed",
    });

    await expect(storage.deleteDurable("projects", "project-1")).resolves.toBe(
      true,
    );
    expect(storage.get("projects", "project-1")).toBeNull();
  });
});
