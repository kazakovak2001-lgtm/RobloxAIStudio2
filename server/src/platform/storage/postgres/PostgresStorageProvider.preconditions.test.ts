import { describe, expect, it } from "vitest";
import { DurableStorageConflictError } from "../StorageProvider";
import {
  PostgresStorageProvider,
  type QueryableClient,
  type QueryablePool,
  type QueryResult,
} from "./PostgresStorageProvider";

interface PreconditionPoolOptions {
  failRequiredDelete?: boolean;
  statements: string[];
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

function createPool(options: PreconditionPoolOptions): QueryablePool {
  let requiredDeleteCount = 0;
  const initialRows = [
    {
      collection: "auth_refresh_credentials",
      id: "old-digest",
      data: { sessionToken: "old-token", expiresAt: Date.now() + 60_000 },
    },
    {
      collection: "auth_sessions",
      id: "old-token",
      data: { token: "old-token", userId: "user-1" },
    },
  ];
  const query = async (text: string): Promise<QueryResult> => {
    const type = statementType(text);
    options.statements.push(type);
    if (type === "SELECT_DATA") return { rows: initialRows };
    if (type === "DELETE" && text.toUpperCase().includes("RETURNING ID")) {
      requiredDeleteCount += 1;
      if (options.failRequiredDelete && requiredDeleteCount === 1) {
        return { rows: [] };
      }
      return { rows: [{ id: `deleted-${requiredDeleteCount}` }] };
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

function provider(options: PreconditionPoolOptions): PostgresStorageProvider {
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

const replacementMutations = [
  {
    operation: "delete" as const,
    collection: "auth_refresh_credentials",
    id: "old-digest",
    requireExisting: true,
  },
  {
    operation: "delete" as const,
    collection: "auth_sessions",
    id: "old-token",
    requireExisting: true,
  },
  {
    operation: "set" as const,
    collection: "auth_sessions",
    id: "new-token",
    data: { token: "new-token", userId: "user-1" },
  },
  {
    operation: "set" as const,
    collection: "auth_refresh_credentials",
    id: "new-digest",
    data: { sessionToken: "new-token", expiresAt: Date.now() + 60_000 },
  },
];

describe("PostgresStorageProvider durable preconditions", () => {
  it("rolls back and preserves cache when a required record was consumed", async () => {
    const statements: string[] = [];
    const storage = provider({ failRequiredDelete: true, statements });
    await storage.ready();
    statements.length = 0;

    await expect(
      storage.applyDurableBatch(replacementMutations),
    ).rejects.toBeInstanceOf(DurableStorageConflictError);

    expect(statements).toEqual(["BEGIN", "DELETE", "ROLLBACK"]);
    expect(storage.isConnected()).toBe(true);
    expect(
      storage.get("auth_refresh_credentials", "old-digest"),
    ).not.toBeNull();
    expect(storage.get("auth_sessions", "old-token")).not.toBeNull();
    expect(storage.get("auth_refresh_credentials", "new-digest")).toBeNull();
    expect(storage.get("auth_sessions", "new-token")).toBeNull();
  });

  it("consumes both required records and publishes replacements after commit", async () => {
    const statements: string[] = [];
    const storage = provider({ statements });
    await storage.ready();
    statements.length = 0;

    await storage.applyDurableBatch(replacementMutations);

    expect(statements).toEqual([
      "BEGIN",
      "DELETE",
      "DELETE",
      "INSERT",
      "INSERT",
      "COMMIT",
    ]);
    expect(storage.get("auth_refresh_credentials", "old-digest")).toBeNull();
    expect(storage.get("auth_sessions", "old-token")).toBeNull();
    expect(storage.get("auth_refresh_credentials", "new-digest")).toEqual({
      sessionToken: "new-token",
      expiresAt: expect.any(Number),
    });
    expect(storage.get("auth_sessions", "new-token")).toEqual({
      token: "new-token",
      userId: "user-1",
    });
  });
});
