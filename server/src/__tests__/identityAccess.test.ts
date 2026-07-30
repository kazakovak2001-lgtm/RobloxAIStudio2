/**
 * Phase 10: Identity & Access Management Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { UserService } from "../platform/users/UserService";
import { SessionManager } from "../platform/auth/SessionManager";
import { TokenProvider } from "../platform/auth/TokenProvider";
import { PermissionMiddleware } from "../platform/security/PermissionMiddleware";
import { UsageService } from "../platform/usage/UsageService";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { SaaSProjectRepository } from "../platform/projects/SaaSProjectRepository";

describe("Phase 10: Identity & Access Management", () => {
  describe("UserService", () => {
    let service: UserService;
    beforeEach(() => {
      service = new UserService();
    });

    it("creates a user successfully", async () => {
      const result = await service.createUser(
        "test@example.com",
        "TestUser",
        "password123",
      );
      expect(result.success).toBe(true);
      expect(result.user!.email).toBe("test@example.com");
    });

    it("rejects invalid email", async () => {
      const result = await service.createUser("invalid", "User", "pass123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("email");
    });

    it("rejects short password", async () => {
      const result = await service.createUser("a@b.com", "User", "12345");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Password");
    });

    it("prevents duplicate email", async () => {
      await service.createUser("dup@test.com", "User1", "pass123");
      const result = await service.createUser(
        "dup@test.com",
        "User2",
        "pass456",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("already registered");
    });

    it("deactivates user", async () => {
      const { user } = await service.createUser(
        "x@y.com",
        "TestX",
        "pass123",
      );
      await service.deactivateUser(user!.id);
      const access = service.validateAccess(user!.id);
      expect(access.allowed).toBe(false);
    });

    it("validates active user access", async () => {
      const { user } = await service.createUser(
        "active@test.com",
        "Active",
        "pass123",
      );
      const access = service.validateAccess(user!.id);
      expect(access.allowed).toBe(true);
    });

    it("hashes and verifies password", () => {
      const hash = service.hashPassword("myPassword");
      expect(hash).not.toBe("myPassword");
      expect(service.verifyPassword("myPassword", hash)).toBe(true);
      expect(service.verifyPassword("wrong", hash)).toBe(false);
    });
  });

  describe("SessionManager", () => {
    let sessions: SessionManager;
    beforeEach(() => {
      sessions = new SessionManager();
    });

    it("creates and validates session", () => {
      const session = sessions.create("user-1");
      expect(session.active).toBe(true);
      const validated = sessions.validate(session.id);
      expect(validated).not.toBeNull();
      expect(validated!.userId).toBe("user-1");
    });

    it("invalidates session", () => {
      const session = sessions.create("user-1");
      sessions.invalidate(session.id);
      expect(sessions.validate(session.id)).toBeNull();
    });

    it("rejects expired session", () => {
      const session = sessions.create("user-1");
      // Manually expire
      session.expiresAt = Date.now() - 1000;
      expect(sessions.validate(session.id)).toBeNull();
    });

    it("invalidates all sessions for user", () => {
      sessions.create("user-1");
      sessions.create("user-1");
      sessions.create("user-2");
      const count = sessions.invalidateAllForUser("user-1");
      expect(count).toBe(2);
      expect(sessions.getActiveSessions("user-1")).toHaveLength(0);
      expect(sessions.getActiveSessions("user-2")).toHaveLength(1);
    });
  });

  describe("TokenProvider", () => {
    let tokens: TokenProvider;
    beforeEach(() => {
      tokens = new TokenProvider();
    });

    it("issues and validates token", () => {
      const token = tokens.issue("user-1", "sess-1", "creator");
      const payload = tokens.validate(token);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-1");
      expect(payload!.role).toBe("creator");
    });

    it("rejects invalid token", () => {
      expect(tokens.validate("fake_token")).toBeNull();
    });

    it("revokes token", () => {
      const token = tokens.issue("user-1", "sess-1", "creator");
      tokens.revoke(token);
      expect(tokens.validate(token)).toBeNull();
    });

    it("revokes all tokens for user", () => {
      tokens.issue("user-1", "s1", "creator");
      tokens.issue("user-1", "s2", "creator");
      tokens.issue("user-2", "s3", "creator");
      const count = tokens.revokeAllForUser("user-1");
      expect(count).toBe(2);
    });
  });

  describe("PermissionMiddleware", () => {
    let perms: PermissionMiddleware;
    let storage: InMemoryStorageProvider;

    beforeEach(() => {
      storage = new InMemoryStorageProvider();
      perms = new PermissionMiddleware(storage);
    });

    it("requires authentication", () => {
      expect(perms.requireAuthentication(null).allowed).toBe(false);
      expect(perms.requireAuthentication("user-1").allowed).toBe(true);
    });

    it("enforces role hierarchy", () => {
      expect(perms.requireRole("creator", "creator").allowed).toBe(true);
      expect(perms.requireRole("creator", "administrator").allowed).toBe(false);
      expect(perms.requireRole("administrator", "creator").allowed).toBe(true);
    });

    it("checks specific permissions", () => {
      expect(perms.requirePermission("creator", "create_project").allowed).toBe(
        true,
      );
      expect(perms.requirePermission("creator", "admin").allowed).toBe(false);
      expect(perms.requirePermission("administrator", "admin").allowed).toBe(
        true,
      );
    });

    it("validates project ownership", async () => {
      const repo = new SaaSProjectRepository(storage);
      const proj = await repo.createDurable("user-1", "Game", "rpg");
      // Need to create a new PermissionMiddleware that uses same storage
      expect(perms.checkOwnership(proj.id, "user-1").allowed).toBe(true);
      expect(perms.checkOwnership(proj.id, "user-2").allowed).toBe(false);
    });
  });

  describe("UsageService", () => {
    let usage: UsageService;
    beforeEach(() => {
      usage = new UsageService();
    });

    it("tracks project creation", () => {
      usage.recordProjectCreated("user-1");
      usage.recordProjectCreated("user-1");
      const record = usage.get("user-1");
      expect(record!.projectCount).toBe(2);
    });

    it("tracks generations", () => {
      usage.recordGeneration("user-1");
      usage.recordGeneration("user-1");
      usage.recordGeneration("user-1");
      expect(usage.get("user-1")!.generationCount).toBe(3);
    });

    it("isolates usage between users", () => {
      usage.recordGeneration("alice");
      usage.recordGeneration("bob");
      usage.recordGeneration("bob");
      expect(usage.get("alice")!.generationCount).toBe(1);
      expect(usage.get("bob")!.generationCount).toBe(2);
    });
  });
});
