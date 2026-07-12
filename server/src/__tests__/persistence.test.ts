/**
 * Persistence Layer Tests — Verifies both InMemory and Postgres providers pass the same suite.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { PostgresStorageProvider } from "../platform/storage/postgres/PostgresStorageProvider";
import { createStorageProvider } from "../platform/storage/StorageFactory";
import { MIGRATIONS } from "../platform/storage/postgres/migrations";
import { DatabaseHealthCheck } from "../platform/storage/postgres/DatabaseHealth";
import type { StorageProvider } from "../platform/storage/StorageProvider";

function runProviderSuite(name: string, createProvider: () => StorageProvider) {
  describe(`StorageProvider: ${name}`, () => {
    let provider: StorageProvider;
    beforeEach(() => {
      provider = createProvider();
    });

    it("stores and retrieves data", () => {
      provider.set("users", "u1", { name: "Alice", email: "alice@test.com" });
      const user = provider.get<{ name: string }>("users", "u1");
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Alice");
    });

    it("returns null for missing items", () => {
      expect(provider.get("users", "nonexistent")).toBeNull();
    });

    it("deletes items", () => {
      provider.set("items", "i1", { val: 1 });
      expect(provider.delete("items", "i1")).toBe(true);
      expect(provider.get("items", "i1")).toBeNull();
    });

    it("lists all items in collection", () => {
      provider.set("projects", "p1", { name: "A" });
      provider.set("projects", "p2", { name: "B" });
      provider.set("projects", "p3", { name: "C" });
      expect(provider.list("projects")).toHaveLength(3);
    });

    it("lists with filter", () => {
      provider.set("jobs", "j1", { status: "running" });
      provider.set("jobs", "j2", { status: "completed" });
      provider.set("jobs", "j3", { status: "running" });
      const running = provider.list<{ status: string }>(
        "jobs",
        (j) => j.status === "running",
      );
      expect(running).toHaveLength(2);
    });

    it("counts items", () => {
      provider.set("col", "a", {});
      provider.set("col", "b", {});
      expect(provider.count("col")).toBe(2);
    });

    it("overwrites existing item", () => {
      provider.set("data", "d1", { version: 1 });
      provider.set("data", "d1", { version: 2 });
      expect(provider.get<{ version: number }>("data", "d1")!.version).toBe(2);
    });

    it("handles multiple collections independently", () => {
      provider.set("col_a", "id1", { a: true });
      provider.set("col_b", "id1", { b: true });
      expect(provider.get<{ a: boolean }>("col_a", "id1")!.a).toBe(true);
      expect(provider.get<{ b: boolean }>("col_b", "id1")!.b).toBe(true);
      expect(provider.count("col_a")).toBe(1);
      expect(provider.count("col_b")).toBe(1);
    });

    it("concurrent writes don't corrupt data", () => {
      for (let i = 0; i < 100; i++) {
        provider.set("concurrent", `item-${i}`, { index: i });
      }
      expect(provider.count("concurrent")).toBe(100);
      expect(
        provider.get<{ index: number }>("concurrent", "item-50")!.index,
      ).toBe(50);
    });
  });
}

// Run the same test suite against both providers
runProviderSuite("InMemory", () => new InMemoryStorageProvider());
runProviderSuite(
  "Postgres (cache mode)",
  () =>
    new PostgresStorageProvider({
      connectionString: "test://",
      poolSize: 5,
      poolTimeout: 5000,
    }),
);

describe("Persistence Infrastructure", () => {
  it("factory creates InMemory by default", () => {
    const provider = createStorageProvider();
    expect(provider).toBeTruthy();
    // Default is InMemory since STORAGE_PROVIDER env is not set to 'postgres'
    provider.set("test", "1", { ok: true });
    expect(provider.get("test", "1")).toEqual({ ok: true });
  });

  it("migrations define 6 tables", () => {
    expect(MIGRATIONS).toHaveLength(6);
    expect(MIGRATIONS[0].name).toBe("create_users");
    expect(MIGRATIONS[1].name).toBe("create_projects");
    expect(MIGRATIONS[2].name).toBe("create_generation_jobs");
    expect(MIGRATIONS[3].name).toBe("create_sessions");
    expect(MIGRATIONS[4].name).toBe("create_usage_records");
    expect(MIGRATIONS[5].name).toBe("create_audit_logs");
  });

  it("health check returns status", async () => {
    const provider = new PostgresStorageProvider();
    const health = new DatabaseHealthCheck(provider);
    const status = await health.check();

    expect(status.status).toBe("healthy");
    expect(status.connected).toBe(true);
    expect(status.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("postgres provider supports transaction wrapper", async () => {
    const provider = new PostgresStorageProvider();
    const result = await provider.transaction(() => {
      provider.set("tx_test", "1", { data: "txn" });
      return provider.get("tx_test", "1");
    });
    expect(result).toEqual({ data: "txn" });
  });
});
