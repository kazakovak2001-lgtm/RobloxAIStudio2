import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
} from "../StorageProvider";
import {
  PostgresStorageProvider,
  type QueryableClient,
  type QueryablePool,
  type QueryResult,
} from "./PostgresStorageProvider";

interface FakePoolOptions {
  rows?: Array<Record<string, unknown>>;
  rejectDirect?: "insert" | "delete";
  rejectBatchAt?: number;
  commitGate?: Promise<void>;
  onCommitStarted?: () => void;
}

interface FakePoolControl {
  pool: QueryablePool;
  statements: string[];
}

function recordKey(collection: string, id: string): string {
  return `${collection}/${id}`;
}

function createFakePool(options: FakePoolOptions = {}): FakePoolControl {
  const statements: string[] = [];
  let database = new Map<string, unknown>();
  for (const row of options.rows ?? []) {
    const collection = row.collection;
    const id = row.id;
    if (typeof collection !== "string" || typeof id !== "string") continue;
    database.set(recordKey(collection, id), row.data);
  }

  const executeDirect = async (
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult> => {
    statements.push(text.trim().split("\n")[0]);
    if (text === "SELECT 1") return { rows: [] };
    if (text.includes("SELECT collection, id, data")) {
      return { rows: options.rows ?? [] };
    }
    if (text.includes("INSERT INTO")) {
      if (options.rejectDirect === "insert") {
        throw new Error("injected insert rejection");
      }
      const [collection, id, serialized] = params;
      database.set(
        recordKey(String(collection), String(id)),
        JSON.parse(String(serialized)),
      );
      return { rows: [] };
    }
    if (text.includes("DELETE FROM")) {
      if (options.rejectDirect === "delete") {
        throw new Error("injected delete rejection");
      }
      database.delete(recordKey(String(params[0]), String(params[1])));
      return { rows: [] };
    }
    return { rows: [] };
  };

  const pool: QueryablePool = {
    query: executeDirect,
    async connect(): Promise<QueryableClient> {
      let transaction: Map<string, unknown> | null = null;
      let batchMutationIndex = 0;
      return {
        async query(
          text: string,
          params: unknown[] = [],
        ): Promise<QueryResult> {
          statements.push(text.trim().split("\n")[0]);
          if (text === "BEGIN") {
            transaction = new Map(database);
            return { rows: [] };
          }
          if (text === "ROLLBACK") {
            transaction = null;
            return { rows: [] };
          }
          if (text === "COMMIT") {
            options.onCommitStarted?.();
            if (options.commitGate) await options.commitGate;
            if (!transaction) throw new Error("transaction is not active");
            database = transaction;
            transaction = null;
            return { rows: [] };
          }
          if (!transaction) throw new Error("transaction is not active");

          if (text.includes("INSERT INTO")) {
            batchMutationIndex += 1;
            if (batchMutationIndex === options.rejectBatchAt) {
              throw new Error("injected batch mutation rejection");
            }
            const [collection, id, serialized] = params;
            transaction.set(
              recordKey(String(collection), String(id)),
              JSON.parse(String(serialized)),
            );
            return { rows: [] };
          }
          if (text.includes("DELETE FROM")) {
            batchMutationIndex += 1;
            if (batchMutationIndex === options.rejectBatchAt) {
              throw new Error("injected batch mutation rejection");
            }
            const key = recordKey(String(params[0]), String(params[1]));
            const deleted = transaction.delete(key);
            return { rows: deleted ? [{ id: params[1] }] : [] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
    async end() {},
  };

  return { pool, statements };
}

function provider(options: FakePoolOptions = {}): {
  storage: PostgresStorageProvider;
  statements: string[];
} {
  const control = createFakePool(options);
  return {
    storage: new PostgresStorageProvider(
      {
        connectionString: "postgresql://test",
        poolSize: 1,
        poolTimeout: 1000,
        strict: true,
      },
      { createPool: () => control.pool },
    ),
    statements: control.statements,
  };
}

describe("PostgresStorageProvider awaited mutations", () => {
  it("does not expose a rejected create in the read cache", async () => {
    const { storage } = provider({ rejectDirect: "insert" });
    await storage.ready();

    await expect(
      storage.setDurable("projects", "project-new", { name: "New" }),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get("projects", "project-new")).toBeNull();
    expect(storage.count("projects")).toBe(0);
  });

  it("retains the exact previous cache value after a rejected update", async () => {
    const previous = { name: "Before", version: 1 };
    const { storage } = provider({
      rows: [{ collection: "projects", id: "project-1", data: previous }],
      rejectDirect: "insert",
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
    const { storage } = provider({
      rows: [{ collection: "projects", id: "project-1", data: previous }],
      rejectDirect: "delete",
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
    const { storage } = provider();
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

describe("PostgresStorageProvider durable batches", () => {
  it("commits all mutations on one transaction-affine client", async () => {
    const existing = { name: "Existing" };
    const { storage, statements } = provider({
      rows: [{ collection: "projects", id: "existing", data: existing }],
    });
    await storage.ready();

    await expect(
      storage.applyDurableBatch([
        {
          operation: "set",
          collection: "projects",
          id: "created",
          data: { name: "Created" },
        },
        {
          operation: "set",
          collection: "users",
          id: "user-1",
          data: { tier: "pro" },
        },
        { operation: "delete", collection: "projects", id: "existing" },
        { operation: "delete", collection: "projects", id: "missing" },
      ]),
    ).resolves.toEqual([
      { operation: "set", collection: "projects", id: "created" },
      { operation: "set", collection: "users", id: "user-1" },
      {
        operation: "delete",
        collection: "projects",
        id: "existing",
        deleted: true,
      },
      {
        operation: "delete",
        collection: "projects",
        id: "missing",
        deleted: false,
      },
    ]);

    expect(storage.get("projects", "existing")).toBeNull();
    expect(storage.get("projects", "created")).toEqual({ name: "Created" });
    expect(storage.get("users", "user-1")).toEqual({ tier: "pro" });
    expect(statements.slice(-6)).toEqual([
      "BEGIN",
      "INSERT INTO kv_store (collection, id, data) VALUES ($1, $2, $3)",
      "INSERT INTO kv_store (collection, id, data) VALUES ($1, $2, $3)",
      "DELETE FROM kv_store WHERE collection = $1 AND id = $2 RETURNING id",
      "DELETE FROM kv_store WHERE collection = $1 AND id = $2 RETURNING id",
      "COMMIT",
    ]);
  });

  it("publishes no batch cache state before COMMIT acknowledgement", async () => {
    let releaseCommit!: () => void;
    let commitStarted!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const commitReached = new Promise<void>((resolve) => {
      commitStarted = resolve;
    });
    const previous = { name: "Before" };
    const { storage } = provider({
      rows: [{ collection: "projects", id: "project-1", data: previous }],
      commitGate,
      onCommitStarted: commitStarted,
    });
    await storage.ready();

    const mutation = storage.applyDurableBatch([
      {
        operation: "set",
        collection: "projects",
        id: "project-1",
        data: { name: "After" },
      },
      {
        operation: "set",
        collection: "users",
        id: "user-1",
        data: { active: true },
      },
    ]);
    await commitReached;

    expect(storage.get("projects", "project-1")).toEqual(previous);
    expect(storage.get("users", "user-1")).toBeNull();

    releaseCommit();
    await mutation;
    expect(storage.get("projects", "project-1")).toEqual({ name: "After" });
    expect(storage.get("users", "user-1")).toEqual({ active: true });
  });

  it("rolls back a rejected middle mutation and preserves exact cache state", async () => {
    const projectBefore = { name: "Before", version: 1 };
    const userBefore = { tier: "free" };
    const { storage, statements } = provider({
      rows: [
        { collection: "projects", id: "project-1", data: projectBefore },
        { collection: "users", id: "user-1", data: userBefore },
      ],
      rejectBatchAt: 2,
    });
    await storage.ready();

    await expect(
      storage.applyDurableBatch([
        {
          operation: "set",
          collection: "projects",
          id: "project-1",
          data: { name: "After", version: 2 },
        },
        {
          operation: "set",
          collection: "users",
          id: "user-2",
          data: { tier: "pro" },
        },
        { operation: "delete", collection: "users", id: "user-1" },
      ]),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "transaction",
    });

    expect(storage.get("projects", "project-1")).toEqual(projectBefore);
    expect(storage.get("users", "user-1")).toEqual(userBefore);
    expect(storage.get("users", "user-2")).toBeNull();
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(storage.getOperationalStatus()).toMatchObject({
      availability: "degraded",
      durability: "durable",
      lastFailureAt: expect.any(String),
    });
  });

  it("reports an available durable provider after initialization", async () => {
    const { storage } = provider();
    await storage.ready();

    expect(storage.getOperationalStatus()).toEqual({
      availability: "available",
      durability: "durable",
      pendingMutations: 0,
    });
  });
});

describe("InMemoryStorageProvider durable batches", () => {
  it("publishes all in-memory mutations atomically", async () => {
    const storage = new InMemoryStorageProvider();
    storage.set("projects", "project-1", { name: "Before" });

    await expect(
      storage.applyDurableBatch([
        {
          operation: "set",
          collection: "projects",
          id: "project-1",
          data: { name: "After" },
        },
        {
          operation: "set",
          collection: "users",
          id: "user-1",
          data: { active: true },
        },
      ]),
    ).resolves.toEqual([
      { operation: "set", collection: "projects", id: "project-1" },
      { operation: "set", collection: "users", id: "user-1" },
    ]);

    expect(storage.get("projects", "project-1")).toEqual({ name: "After" });
    expect(storage.get("users", "user-1")).toEqual({ active: true });
  });

  it("preserves exact state when an in-memory batch is invalid", async () => {
    const storage = new InMemoryStorageProvider();
    const previous = { name: "Before", version: 1 };
    storage.set("projects", "project-1", previous);

    const invalidMutation = {
      operation: "set",
      collection: "users",
      id: "",
      data: { active: true },
    } as DurableMutation;
    await expect(
      storage.applyDurableBatch([
        {
          operation: "set",
          collection: "projects",
          id: "project-1",
          data: { name: "After", version: 2 },
        },
        invalidMutation,
      ]),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "transaction",
    });

    expect(storage.get("projects", "project-1")).toEqual(previous);
    expect(storage.get("users", "")).toBeNull();
  });
});
