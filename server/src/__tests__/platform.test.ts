/**
 * Platform Tests — User management, versioning, and registry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { UserRepository } from "../platform/users";
import { VersionHistoryRepository } from "../platform/versioning";
import { AgentRegistryService } from "../platform/registry";

describe("Platform Layer", () => {
  describe("UserRepository", () => {
    let repo: UserRepository;

    beforeEach(() => {
      repo = new UserRepository();
    });

    it("creates a user with default free tier", async () => {
      const user = await repo.createDurable({
        email: "test@test.com",
        displayName: "Test",
      });
      expect(user.tier).toBe("free");
      expect(user.limits.maxProjects).toBe(3);
      expect(user.status).toBe("active");
    });

    it("finds user by email", async () => {
      await repo.createDurable({ email: "a@b.com", displayName: "A" });
      const found = repo.getByEmail("a@b.com");
      expect(found).not.toBeNull();
      expect(found!.displayName).toBe("A");
    });

    it("upgrades tier and updates limits", async () => {
      const user = await repo.createDurable({
        email: "x@y.com",
        displayName: "X",
      });
      const updated = await repo.updateTierDurable(user.id, "pro");
      expect(updated!.tier).toBe("pro");
      expect(updated!.limits.maxProjects).toBe(50);
    });

    it("tracks generation usage", async () => {
      const user = await repo.createDurable({
        email: "u@v.com",
        displayName: "U",
      });
      await repo.recordGenerationDurable(user.id, 1000);
      await repo.recordGenerationDurable(user.id, 2000);
      const fetched = repo.getById(user.id);
      expect(fetched!.usage.generationsTotal).toBe(2);
      expect(fetched!.usage.tokensUsedTotal).toBe(3000);
    });

    it("enforces daily generation limit", async () => {
      const user = await repo.createDurable({
        email: "limit@test.com",
        displayName: "Limit",
      });
      for (let i = 0; i < 5; i++) {
        await repo.recordGenerationDurable(user.id, 100);
      }
      const check = repo.checkLimits(user.id);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("limit");
    });
  });

  describe("VersionHistoryRepository", () => {
    let repo: VersionHistoryRepository;

    beforeEach(() => {
      repo = new VersionHistoryRepository();
    });

    it("saves and retrieves versions", () => {
      repo.save("proj-1", {
        projectId: "proj-1",
        label: "v1",
        scriptCount: 8,
        assetCount: 20,
        qualityScore: 85,
        snapshot: {},
      });
      repo.save("proj-1", {
        projectId: "proj-1",
        label: "v2",
        scriptCount: 10,
        assetCount: 23,
        qualityScore: 90,
        snapshot: {},
      });
      const history = repo.getHistory("proj-1");
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2); // sorted desc
    });

    it("gets specific version", () => {
      repo.save("proj-1", {
        projectId: "proj-1",
        label: "first",
        scriptCount: 5,
        assetCount: 10,
        qualityScore: 70,
        snapshot: {},
      });
      const v1 = repo.getVersion("proj-1", 1);
      expect(v1).not.toBeNull();
      expect(v1!.label).toBe("first");
    });

    it("gets latest version", () => {
      repo.save("proj-1", {
        projectId: "proj-1",
        label: "a",
        scriptCount: 1,
        assetCount: 1,
        qualityScore: 50,
        snapshot: {},
      });
      repo.save("proj-1", {
        projectId: "proj-1",
        label: "b",
        scriptCount: 2,
        assetCount: 2,
        qualityScore: 60,
        snapshot: {},
      });
      const latest = repo.getLatest("proj-1");
      expect(latest!.label).toBe("b");
      expect(latest!.version).toBe(2);
    });
  });

  describe("AgentRegistryService", () => {
    let registry: AgentRegistryService;

    beforeEach(() => {
      registry = new AgentRegistryService();
    });

    it("has 9 seeded agents", () => {
      expect(registry.getAll()).toHaveLength(9);
      expect(registry.getActive()).toHaveLength(9);
    });

    it("retrieves agent by ID", () => {
      const agent = registry.get("lua_generator");
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe("Lua Generator");
      expect(agent!.capabilities).toContain("lua_generation");
    });

    it("records execution and updates metrics", () => {
      registry.recordExecution("lua_generator", 1500, 0.003, true);
      registry.recordExecution("lua_generator", 2000, 0.004, true);
      const agent = registry.get("lua_generator");
      expect(agent!.totalExecutions).toBe(2);
      expect(agent!.avgTokenUsage).toBeGreaterThan(0);
      expect(agent!.lastExecutedAt).toBeDefined();
    });
  });
});
