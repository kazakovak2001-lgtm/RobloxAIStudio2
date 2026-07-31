import { describe, expect, it } from "vitest";
import {
  DurableStorageConflictError,
  PostgresStorageProvider,
} from "../platform/storage";
import type {
  QueryableClient,
  QueryablePool,
  QueryResult,
} from "../platform/storage/postgres/PostgresStorageProvider";

function createPool(options?: {
  failNextSet?: boolean;
  conflictOnInsert?: boolean;
}): QueryablePool {
  let failNextSet = options?.failNextSet ?? false;

  const client: QueryableClient = {
    async query(text: string): Promise<QueryResult> {
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO") && options?.conflictOnInsert) {
        return { rows: [] };
      }
      return { rows: [{ id: "record" }] };
    },
    release() {},
  };

  return {
    async query(text: string): Promise<QueryResult> {
      if (text === "SELECT 1") return { rows: [{ ok: true }] };
      if (text.includes("SELECT collection, id, data")) return { rows: [] };
      if (text.includes("INSERT INTO") && failNextSet) {
        failNextSet = false;
        throw new Error("simulated infrastructure rejection");
      }
      return { rows: [] };
    },
    async connect(): Promise<QueryableClient> {
      return client;
    },
    async end(): Promise<void> {},
  };
}

describe("PostgresStorageProvider operational state", () => {
  it("keeps mutation failure degraded until acknowledged recovery", async () => {
    const provider = new PostgresStorageProvider(
      { strict: true },
      { createPool: () => createPool({ failNextSet: true }) },
    );
    await provider.ready();

    await expect(
      provider.setDurable("records", "record-1", { value: "first" }),
    ).rejects.toThrow("Durable set failed");
    expect(provider.getOperationalStatus()).toMatchObject({
      availability: "degraded",
      failureCategory: "durable-mutation",
      failureOperation: "set",
    });

    await provider.setDurable("records", "record-1", { value: "second" });
    expect(provider.getOperationalStatus()).toMatchObject({
      availability: "available",
      lastRecoveryAt: expect.any(String),
    });
    expect(provider.getOperationalStatus().lastFailureAt).toBeUndefined();
  });

  it("does not classify expected durable conflicts as degradation", async () => {
    const provider = new PostgresStorageProvider(
      { strict: true },
      { createPool: () => createPool({ conflictOnInsert: true }) },
    );
    await provider.ready();

    await expect(
      provider.applyDurableBatch([
        {
          operation: "set",
          collection: "records",
          id: "record-1",
          data: { value: true },
          requireAbsent: true,
        },
      ]),
    ).rejects.toBeInstanceOf(DurableStorageConflictError);

    expect(provider.getOperationalStatus()).toEqual({
      availability: "available",
      durability: "durable",
      pendingMutations: 0,
    });
  });
});
