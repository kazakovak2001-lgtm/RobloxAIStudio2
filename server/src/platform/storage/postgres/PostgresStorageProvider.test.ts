import { describe, expect, it } from "vitest";
import { DurableStorageError } from "../StorageProvider";
import {
  PostgresStorageProvider,
  type QueryableClient,
  type QueryablePool,
} from "./PostgresStorageProvider";

interface FakePoolOptions {
  rows?: Array<Record<string, unknown>>;
  reject?: "insert" | "delete" | "commit";
  rejectInsertAt?: number;
  statements?: string[];
  onRelease?: () => void;
}

function statementType(text: string): string {
  const normalized = text.trim().toUpperCase();
  if (normalized.startsWith("SELECT COLLECTION")) return "SELECT_DATA";
  if (normalized.startsWith("SELECT")) return "SELECT";
  if (normalized.startsWith("INSERT")) return "INSERT";
  if (normalized.startsWith("DELETE")) return "DELETE";
  if (normalized.startsWith("BEGIN")) return "BEGIN";
  if (normalized.startsWith("COMMIT")) return "COMMIT";
  if (normalized.startsWith("ROLLBACK")) return "ROLLBACK";
  return normalized.split(/\s+/)[0] ?? normalized;
}

function fakePool(options: FakePoolOptions = {}): QueryablePool {
  let insertCount = 0;
  const query = async (text: string) => {
    const type = statementType(text);
    options.statements?.push(type);
    if (type === "INSERT") {
      insertCount += 1;
      if (
        options.reject === "insert" ||
        options.rejectInsertAt === insertCount
      ) {
        throw new Error("injected insert rejection");
      }
    }
    if (options.reject === "delete" && type === "DELETE") {
      throw new Error("injected delete rejection");
    }
    if (options.reject === "commit" && type === "COMMIT") {
      throw new Error("injected commit rejection");
    }
    if (type === "SELECT_DATA") {
      return { rows: options.rows ?? [] };
    }
    return { rows: [] };
  };
  const client: QueryableClient = {
    query,
    release() {
      options.onRelease?.();
    },
  };
  return {
    query,
    async connect() {
      return client;
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
    const query = async (text: string) => {
      if (statementType(text) === "SELECT_DATA") return { rows: [] };
      if (statementType(text) === "INSERT") await insertAcknowledged;
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

  it("commits a durable batch on one client before publishing cache state", async () => {
    const statements: string[] = [];
    let releases = 0;
    const storage = provider({
      statements,
      onRelease: () => {
        releases += 1;
      },
    });
    await storage.ready();
    statements.length = 0;

    await storage.mutateDurably([
      {
        type: "set",
        collection: "chat_conversations",
        id: "conversation-1",
        data: { updatedAt: "now" },
      },
      {
        type: "set",
        collection: "chat_messages",
        id: "message-1",
        data: { conversationId: "conversation-1" },
      },
    ]);

    expect(statements).toEqual(["BEGIN", "INSERT", "INSERT", "COMMIT"]);
    expect(releases).toBe(1);
    expect(storage.get("chat_conversations", "conversation-1")).toEqual({
      updatedAt: "now",
    });
    expect(storage.get("chat_messages", "message-1")).toEqual({
      conversationId: "conversation-1",
    });
  });

  it("does not publish any batch record before COMMIT is acknowledged", async () => {
    let acknowledgeCommit: (() => void) | undefined;
    let markCommitStarted: (() => void) | undefined;
    const commitAcknowledged = new Promise<void>((resolve) => {
      acknowledgeCommit = resolve;
    });
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const query = async (text: string) => {
      const type = statementType(text);
      if (type === "SELECT_DATA") return { rows: [] };
      if (type === "COMMIT") {
        markCommitStarted?.();
        await commitAcknowledged;
      }
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

    const mutation = storage.mutateDurably([
      {
        type: "set",
        collection: "chat_conversations",
        id: "conversation-pending",
        data: { updatedAt: "pending" },
      },
      {
        type: "set",
        collection: "chat_messages",
        id: "message-pending",
        data: { conversationId: "conversation-pending" },
      },
    ]);
    await commitStarted;

    expect(
      storage.get("chat_conversations", "conversation-pending"),
    ).toBeNull();
    expect(storage.get("chat_messages", "message-pending")).toBeNull();

    acknowledgeCommit?.();
    await mutation;
    expect(storage.get("chat_conversations", "conversation-pending")).toEqual({
      updatedAt: "pending",
    });
    expect(storage.get("chat_messages", "message-pending")).toEqual({
      conversationId: "conversation-pending",
    });
  });

  it("rolls back the database and preserves all cache values when a batch fails", async () => {
    const statements: string[] = [];
    const previous = { updatedAt: "before" };
    const storage = provider({
      rows: [
        {
          collection: "chat_conversations",
          id: "conversation-1",
          data: previous,
        },
      ],
      rejectInsertAt: 2,
      statements,
    });
    await storage.ready();
    statements.length = 0;

    await expect(
      storage.mutateDurably([
        {
          type: "set",
          collection: "chat_conversations",
          id: "conversation-1",
          data: { updatedAt: "after" },
        },
        {
          type: "set",
          collection: "chat_messages",
          id: "message-1",
          data: { conversationId: "conversation-1" },
        },
      ]),
    ).rejects.toMatchObject({
      name: "DurableStorageError",
      operation: "batch",
    });

    expect(statements).toEqual(["BEGIN", "INSERT", "INSERT", "ROLLBACK"]);
    expect(storage.get("chat_conversations", "conversation-1")).toEqual(
      previous,
    );
    expect(storage.get("chat_messages", "message-1")).toBeNull();
  });
});
