import { describe, expect, it } from "vitest";
import { DurableStorageConflictError } from "../StorageProvider";
import {
  PostgresStorageProvider,
  type QueryableClient,
  type QueryablePool,
  type QueryResult,
} from "./PostgresStorageProvider";

interface CreatePreconditionOptions {
  conflictCollection?: string;
  statements: string[];
}

function statementType(text: string): string {
  const normalized = text.trim().toUpperCase();
  if (normalized.startsWith("SELECT COLLECTION")) return "SELECT_DATA";
  if (normalized.startsWith("SELECT")) return "SELECT";
  if (normalized.startsWith("INSERT")) return "INSERT";
  if (normalized.startsWith("BEGIN")) return "BEGIN";
  if (normalized.startsWith("COMMIT")) return "COMMIT";
  if (normalized.startsWith("ROLLBACK")) return "ROLLBACK";
  return normalized.split(/\s+/)[0] ?? normalized;
}

function createPool(options: CreatePreconditionOptions): QueryablePool {
  const query = async (
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult> => {
    const type = statementType(text);
    options.statements.push(type);
    if (type === "SELECT_DATA") return { rows: [] };
    if (
      type === "INSERT" &&
      text.toUpperCase().includes("DO NOTHING RETURNING ID")
    ) {
      const collection = params[0];
      if (collection === options.conflictCollection) return { rows: [] };
      return { rows: [{ id: params[1] }] };
    }
    return { rows: [] };
  };
  const client: QueryableClient = { query, release() {} };
  return {
    query,
    async connect() {
      return client;
    },
    async end() {},
  };
}

function provider(options: CreatePreconditionOptions): PostgresStorageProvider {
  return new PostgresStorageProvider(
    {
      connectionString: "postgresql://test",
      poolSize: 1,
      poolTimeout: 1000,
      strict: true,
    },
    { createPool: () => createPool(options) },
  );
}

const accountMutations = [
  {
    type: "set" as const,
    collection: "users",
    id: "user-new",
    data: { id: "user-new", email: "owner@example.test" },
    requireAbsent: true,
  },
  {
    type: "set" as const,
    collection: "auth_credentials",
    id: "owner@example.test",
    data: { userId: "user-new" },
    requireAbsent: true,
  },
  {
    type: "set" as const,
    collection: "auth_roles",
    id: "user-new",
    data: "creator",
    requireAbsent: true,
  },
  {
    type: "set" as const,
    collection: "auth_sessions",
    id: "token-new",
    data: { token: "token-new", userId: "user-new" },
    requireAbsent: true,
  },
  {
    type: "set" as const,
    collection: "auth_refresh_credentials",
    id: "digest-new",
    data: { sessionToken: "token-new" },
    requireAbsent: true,
  },
];

describe("PostgresStorageProvider durable create preconditions", () => {
  it("rolls back earlier inserts when credentials already exist", async () => {
    const statements: string[] = [];
    const storage = provider({
      conflictCollection: "auth_credentials",
      statements,
    });
    await storage.ready();
    statements.length = 0;

    await expect(storage.mutateDurably(accountMutations)).rejects.toMatchObject(
      {
        name: "DurableStorageConflictError",
        collection: "auth_credentials",
        id: "owner@example.test",
      },
    );

    expect(statements).toEqual(["BEGIN", "INSERT", "INSERT", "ROLLBACK"]);
    expect(storage.isConnected()).toBe(true);
    expect(storage.get("users", "user-new")).toBeNull();
    expect(storage.get("auth_credentials", "owner@example.test")).toBeNull();
    expect(storage.get("auth_roles", "user-new")).toBeNull();
    expect(storage.get("auth_sessions", "token-new")).toBeNull();
    expect(storage.get("auth_refresh_credentials", "digest-new")).toBeNull();
  });

  it("commits and publishes all account records together", async () => {
    const statements: string[] = [];
    const storage = provider({ statements });
    await storage.ready();
    statements.length = 0;

    await storage.mutateDurably(accountMutations);

    expect(statements).toEqual([
      "BEGIN",
      "INSERT",
      "INSERT",
      "INSERT",
      "INSERT",
      "INSERT",
      "COMMIT",
    ]);
    expect(storage.get("users", "user-new")).toEqual({
      id: "user-new",
      email: "owner@example.test",
    });
    expect(storage.get("auth_credentials", "owner@example.test")).toEqual({
      userId: "user-new",
    });
    expect(storage.get("auth_roles", "user-new")).toBe("creator");
    expect(storage.get("auth_sessions", "token-new")).toEqual({
      token: "token-new",
      userId: "user-new",
    });
    expect(storage.get("auth_refresh_credentials", "digest-new")).toEqual({
      sessionToken: "token-new",
    });
  });

  it("classifies an absent-create collision as a durable conflict", async () => {
    const statements: string[] = [];
    const storage = provider({ conflictCollection: "users", statements });
    await storage.ready();

    await expect(
      storage.mutateDurably(accountMutations),
    ).rejects.toBeInstanceOf(DurableStorageConflictError);
  });
});
