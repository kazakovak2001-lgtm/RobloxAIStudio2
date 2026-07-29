import { describe, expect, it } from "vitest";
import {
  DurableStorageConflictError,
  DurableStorageError,
} from "../StorageProvider";
import {
  PostgresStorageProvider,
  type QueryablePool,
} from "./PostgresStorageProvider";

interface RecordedQuery {
  text: string;
  params?: unknown[];
  source: "pool" | "client";
}

interface FakePoolOptions {
  rows?: Array<Record<string, unknown>>;
  reject?: "insert" | "delete";
  rejectId?: string;
  conflictId?: string;
  queries?: RecordedQuery[];
  blockCommit?: Promise<void>;
  onCommit?: () => void;
  onConnect?: () => void;
  onRelease?: () => void;
}

function fakePool(options: FakePoolOptions = {}): QueryablePool {
  const execute = async (
    source: RecordedQuery["source"],
    text: string,
    params?: unknown[],
  ) => {
    options.queries?.push({ text, params, source });
    if (text.trim() === "COMMIT") {
      options.onCommit?.();
      await options.blockCommit;
    }
    if (
      options.reject === "insert" &&
      text.includes("INSERT INTO") &&
      (!options.rejectId || params?.[1] === options.rejectId)
    ) {
      throw new Error("injected insert rejection");
    }
    if (
      options.reject === "delete" &&
      text.includes("DELETE FROM") &&
      (!options.rejectId || params?.[1] === options.rejectId)
    ) {
      throw new Error("injected delete rejection");
    }
    if (text.includes("SELECT collection, id, data")) {
      return { rows: options.rows ?? [] };
    }
    if (text.includes("DO NOTHING") && text.includes("RETURNING id")) {
      return params?.[1] === options.conflictId
        ? { rows: [] }
        : { rows: [{ id: params?.[1] }] };
    }
    return { rows: [] };
  };

  return {
    query: (text, params) => execute("pool", text, params),
    async connect() {
      options.onConnect?.();
      return {
        query: (text, params) => execute("client", text, params),
        release() {
          options.onRelease?.();
        },
      };
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

function clientStatements(queries: RecordedQuery[]): string[] {
  return queries
    .filter(({ source }) => source === "client")
    .map(({ text }) => text.trim().split(/\s+/)[0]);
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
    const query = async (text: string) => {
      if (text.includes("SELECT collection, id, data")) return { rows: [] };
      if (text.includes("INSERT INTO")) await insertAcknowledged;
      return { rows: [] };
    };
    const pool: QueryablePool = {
      query,
      async connect() {
        return { query, release() {} };
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

  it("executes an atomic batch on one checked-out client", async () => {
    const queries: RecordedQuery[] = [];
    let connections = 0;
    let releases = 0;
    const storage = provider({
      rows: [
        {
          collection: "projects",
          id: "project-delete",
          data: { name: "Delete" },
        },
      ],
      queries,
      onConnect: () => {
        connections += 1;
      },
      onRelease: () => {
        releases += 1;
      },
    });
    await storage.ready();

    await storage.mutateDurably([
      {
        type: "set",
        collection: "projects",
        id: "project-create",
        data: { name: "Create" },
      },
      { type: "delete", collection: "projects", id: "project-delete" },
    ]);

    expect(connections).toBe(1);
    expect(releases).toBe(1);
    expect(clientStatements(queries)).toEqual([
      "BEGIN",
      "INSERT",
      "DELETE",
      "COMMIT",
    ]);
    expect(storage.get("projects", "project-create")).toEqual({
      name: "Create",
    });
    expect(storage.get("projects", "project-delete")).toBeNull();
  });

  it("rolls back create-if-absent conflicts without cache publication", async () => {
    const queries: RecordedQuery[] = [];
    const options: FakePoolOptions = {
      conflictId: "duplicate@example.com",
      queries,
    };
    const storage = provider(options);
    await storage.ready();

    await expect(
      storage.mutateDurably([
        {
          type: "create",
          collection: "auth_credentials",
          id: "duplicate@example.com",
          data: { userId: "user-1" },
        },
        {
          type: "set",
          collection: "auth_roles",
          id: "user-1",
          data: "creator",
        },
      ]),
    ).rejects.toBeInstanceOf(DurableStorageConflictError);

    expect(clientStatements(queries)).toEqual([
      "BEGIN",
      "INSERT",
      "ROLLBACK",
    ]);
    expect(storage.count("auth_credentials")).toBe(0);
    expect(storage.count("auth_roles")).toBe(0);

    options.conflictId = undefined;
    await storage.mutateDurably([
      {
        type: "create",
        collection: "auth_credentials",
        id: "recovered@example.com",
        data: { userId: "user-2" },
      },
    ]);
    expect(storage.get("auth_credentials", "recovered@example.com")).toEqual({
      userId: "user-2",
    });
  });

  it("rolls back the database and preserves the exact cache after rejection", async () => {
    const previous = { name: "Before", version: 1 };
    const queries: RecordedQuery[] = [];
    const storage = provider({
      rows: [{ collection: "projects", id: "project-1", data: previous }],
      reject: "insert",
      rejectId: "project-2",
      queries,
    });
    await storage.ready();

    await expect(
      storage.mutateDurably([
        {
          type: "set",
          collection: "projects",
          id: "project-1",
          data: { name: "After", version: 2 },
        },
        {
          type: "set",
          collection: "projects",
          id: "project-2",
          data: { name: "Rejected" },
        },
      ]),
    ).rejects.toMatchObject({ operation: "batch" });

    expect(clientStatements(queries)).toEqual([
      "BEGIN",
      "INSERT",
      "INSERT",
      "ROLLBACK",
    ]);
    expect(storage.get("projects", "project-1")).toEqual(previous);
    expect(storage.get("projects", "project-2")).toBeNull();
  });

  it("publishes no partial batch state before COMMIT acknowledgement", async () => {
    let acknowledgeCommit: (() => void) | undefined;
    let reportCommitStarted: (() => void) | undefined;
    const commitAcknowledged = new Promise<void>((resolve) => {
      acknowledgeCommit = resolve;
    });
    const commitStarted = new Promise<void>((resolve) => {
      reportCommitStarted = resolve;
    });
    const previous = { name: "Before" };
    const storage = provider({
      rows: [{ collection: "projects", id: "project-1", data: previous }],
      blockCommit: commitAcknowledged,
      onCommit: () => reportCommitStarted?.(),
    });
    await storage.ready();

    const batch = storage.mutateDurably([
      {
        type: "set",
        collection: "projects",
        id: "project-1",
        data: { name: "After" },
      },
      {
        type: "set",
        collection: "projects",
        id: "project-2",
        data: { name: "Created" },
      },
    ]);
    await commitStarted;

    expect(storage.get("projects", "project-1")).toEqual(previous);
    expect(storage.get("projects", "project-2")).toBeNull();

    acknowledgeCommit?.();
    await batch;
    expect(storage.get("projects", "project-1")).toEqual({ name: "After" });
    expect(storage.get("projects", "project-2")).toEqual({ name: "Created" });
  });

  it("does not poison later queued mutations after a rolled-back batch", async () => {
    const options: FakePoolOptions = {
      reject: "insert",
      rejectId: "project-rejected",
    };
    const storage = provider(options);
    await storage.ready();

    await expect(
      storage.mutateDurably([
        {
          type: "set",
          collection: "projects",
          id: "project-rejected",
          data: { name: "Rejected" },
        },
      ]),
    ).rejects.toMatchObject({ operation: "batch" });

    options.reject = undefined;
    options.rejectId = undefined;
    await storage.setDurable("projects", "project-recovered", {
      name: "Recovered",
    });

    expect(storage.get("projects", "project-recovered")).toEqual({
      name: "Recovered",
    });
  });
});
