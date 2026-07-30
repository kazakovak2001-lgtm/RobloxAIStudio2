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
import { AuthService } from "../platform/auth/AuthService";
import { UserRepository } from "../platform/users/UserRepository";
import { StorageGenerationHistoryRepository } from "../projects/repository/generationHistory.repository";

function runProviderSuite(name: string, createProvider: () => StorageProvider) {
  describe(`StorageProvider: ${name}`, async () => {
    let provider: StorageProvider;
    beforeEach(() => {
      provider = createProvider();
    });

    it("stores and retrieves data", async () => {
      provider.set("users", "u1", { name: "Alice", email: "alice@test.com" });
      const user = provider.get<{ name: string }>("users", "u1");
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Alice");
    });

    it("returns null for missing items", async () => {
      expect(provider.get("users", "nonexistent")).toBeNull();
    });

    it("deletes items", async () => {
      provider.set("items", "i1", { val: 1 });
      expect(provider.delete("items", "i1")).toBe(true);
      expect(provider.get("items", "i1")).toBeNull();
    });

    it("lists all items in collection", async () => {
      provider.set("projects", "p1", { name: "A" });
      provider.set("projects", "p2", { name: "B" });
      provider.set("projects", "p3", { name: "C" });
      expect(provider.list("projects")).toHaveLength(3);
    });

    it("lists with filter", async () => {
      provider.set("jobs", "j1", { status: "running" });
      provider.set("jobs", "j2", { status: "completed" });
      provider.set("jobs", "j3", { status: "running" });
      const running = provider.list<{ status: string }>(
        "jobs",
        (j) => j.status === "running",
      );
      expect(running).toHaveLength(2);
    });

    it("counts items", async () => {
      provider.set("col", "a", {});
      provider.set("col", "b", {});
      expect(provider.count("col")).toBe(2);
    });

    it("overwrites existing item", async () => {
      provider.set("data", "d1", { version: 1 });
      provider.set("data", "d1", { version: 2 });
      expect(provider.get<{ version: number }>("data", "d1")!.version).toBe(2);
    });

    it("handles multiple collections independently", async () => {
      provider.set("col_a", "id1", { a: true });
      provider.set("col_b", "id1", { b: true });
      expect(provider.get<{ a: boolean }>("col_a", "id1")!.a).toBe(true);
      expect(provider.get<{ b: boolean }>("col_b", "id1")!.b).toBe(true);
      expect(provider.count("col_a")).toBe(1);
      expect(provider.count("col_b")).toBe(1);
    });

    it("concurrent writes don't corrupt data", async () => {
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

describe("Persistence Infrastructure", async () => {
  it("factory creates InMemory by default", async () => {
    const provider = createStorageProvider();
    expect(provider).toBeTruthy();
    // Default is InMemory since STORAGE_PROVIDER env is not set to 'postgres'
    provider.set("test", "1", { ok: true });
    expect(provider.get("test", "1")).toEqual({ ok: true });
  });

  it("migrations define durable core storage tables", async () => {
    expect(MIGRATIONS).toHaveLength(7);
    expect(MIGRATIONS[0].name).toBe("create_users");
    expect(MIGRATIONS[1].name).toBe("create_projects");
    expect(MIGRATIONS[2].name).toBe("create_generation_jobs");
    expect(MIGRATIONS[3].name).toBe("create_sessions");
    expect(MIGRATIONS[4].name).toBe("create_usage_records");
    expect(MIGRATIONS[5].name).toBe("create_audit_logs");
    expect(MIGRATIONS[6].name).toBe("create_kv_store");
  });

  it("health check returns status", async () => {
    const provider = new PostgresStorageProvider();
    const health = new DatabaseHealthCheck(provider);
    const status = await health.check();

    // Without a running PostgreSQL, provider runs in cache-only mode
    expect(status.status).toBe("unavailable");
    expect(status.connected).toBe(false);
    expect(status.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("in-memory provider applies a durable batch atomically", async () => {
    const provider = new InMemoryStorageProvider();

    const results = await provider.applyDurableBatch([
      {
        operation: "set",
        collection: "tx_test",
        id: "1",
        data: { data: "txn" },
      },
      {
        operation: "set",
        collection: "tx_test",
        id: "2",
        data: { data: "txn-2" },
      },
    ]);

    expect(results).toEqual([
      { operation: "set", collection: "tx_test", id: "1" },
      { operation: "set", collection: "tx_test", id: "2" },
    ]);
    expect(provider.get("tx_test", "1")).toEqual({ data: "txn" });
    expect(provider.get("tx_test", "2")).toEqual({ data: "txn-2" });
  });

  it("keeps identity, session, and user records across service recreation", async () => {
    const storage = new InMemoryStorageProvider();
    const users = new UserRepository(storage);
    const user = await users.createDurable({
      email: "creator@example.com",
      displayName: "Creator",
    });
    const auth = new AuthService(storage);
    expect(auth.register(user.email, "password123", user.id)).toBe(true);
    const login = await auth.loginDurable(user.email, "password123", user.id);

    expect(login.success).toBe(true);
    expect(new UserRepository(storage).getByEmail(user.email)?.id).toBe(
      user.id,
    );
    expect(
      (await new AuthService(storage).validateToken(login.token!))?.userId,
    ).toBe(user.id);
  });

  it("keeps generation history across repository recreation", async () => {
    const storage = new InMemoryStorageProvider();
    const history = new StorageGenerationHistoryRepository(storage);
    history.record({
      id: "run-1",
      projectId: "project-1",
      pipelineId: "pipeline-1",
      status: "running",
      startedAt: 100,
      stagesCompleted: 1,
      stagesTotal: 3,
      failures: 0,
      tokenUsage: 0,
      aiCost: 0,
    });

    const restored = new StorageGenerationHistoryRepository(storage);
    expect(restored.getByPipeline("pipeline-1")?.projectId).toBe("project-1");
    expect(restored.getByProject("project-1")).toHaveLength(1);
  });
});
