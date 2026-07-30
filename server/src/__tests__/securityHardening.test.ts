/**
 * Security Hardening Tests — Verify middleware behavior.
 */

import { describe, it, expect } from "vitest";
import {
  rateLimiter,
  loginRateLimiter,
  securityHeaders,
  corsMiddleware,
  authMiddleware,
  requestLogger,
  getApiKeyStore,
} from "../common/middleware/security";
import { AuthService } from "../platform/auth/AuthService";
import { authService } from "../platform/auth/authServiceInstance";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";

describe("Security Hardening", async () => {
  describe("Middleware exports", async () => {
    it("rateLimiter is a function", async () => {
      expect(typeof rateLimiter).toBe("function");
    });

    it("loginRateLimiter is a function", async () => {
      expect(typeof loginRateLimiter).toBe("function");
    });

    it("securityHeaders (helmet) is a function", async () => {
      expect(typeof securityHeaders).toBe("function");
    });

    it("corsMiddleware is a function", async () => {
      expect(typeof corsMiddleware).toBe("function");
    });

    it("authMiddleware is a function", async () => {
      expect(typeof authMiddleware).toBe("function");
    });

    it("requestLogger is a function", async () => {
      expect(typeof requestLogger).toBe("function");
    });
  });

  describe("Durable role mutations", async () => {
    it("publishes a role only after durable acknowledgement", async () => {
      let resolveMutation: (() => void) | undefined;
      const storage = new InMemoryStorageProvider();
      const auth = new AuthService(storage);
      await auth.setRole("role-user", "creator");
      const originalSetDurable = storage.setDurable.bind(storage);
      storage.setDurable = async (collection, id, data) => {
        await new Promise<void>((resolve) => {
          resolveMutation = resolve;
        });
        await originalSetDurable(collection, id, data);
      };

      const pending = auth.setRole("role-user", "administrator");
      expect(auth.hasPermission("role-user", "create_project")).toBe(true);
      expect(auth.hasPermission("role-user", "admin")).toBe(false);

      if (!resolveMutation) {
        throw new Error("Durable mutation was not blocked");
      }
      resolveMutation();
      await pending;
      expect(auth.hasPermission("role-user", "admin")).toBe(true);
    });

    it("preserves the previous role when durable persistence rejects", async () => {
      const storage = new InMemoryStorageProvider();
      const auth = new AuthService(storage);
      await auth.setRole("role-user", "creator");
      storage.setDurable = async () => {
        throw new Error("rejected role write");
      };

      await expect(auth.setRole("role-user", "administrator")).rejects.toThrow(
        "rejected role write",
      );
      expect(auth.hasPermission("role-user", "create_project")).toBe(true);
      expect(auth.hasPermission("role-user", "admin")).toBe(false);
    });
  });

  describe("Auth middleware logic", async () => {
    it("skips auth in non-production (NODE_ENV !== production)", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      let nextCalled = false;
      const req = { path: "/api/protected", headers: {} } as never;
      const res = { status: () => ({ json: () => {} }) } as never;
      const next = () => {
        nextCalled = true;
      };

      await authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it("rejects unauthenticated request in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      let statusCode = 0;
      let responseBody: unknown = null;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: {},
      } as never;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: unknown) => {
              responseBody = body;
            },
          };
        },
      } as never;
      const next = () => {};

      await authMiddleware(req, res, next);
      expect(statusCode).toBe(401);
      expect((responseBody as { error: string }).error).toContain(
        "Authentication",
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("allows Bearer token in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      authService.register("sec-test@test.com", "password123", "user-sec-1");
      const loginResult = authService.login(
        "sec-test@test.com",
        "password123",
        "user-sec-1",
      );

      let nextCalled = false;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: { authorization: `Bearer ${loginResult.token}` },
      } as never;
      const res = {} as never;
      const next = () => {
        nextCalled = true;
      };

      await authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

      authService.logout(loginResult.token!);
      process.env.NODE_ENV = originalEnv;
    });

    it("allows a registered API key in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const store = getApiKeyStore();
      await store.clearDurable();
      const issued = await store.issueDurable("my-api-key-1234567", {
        label: "security-test",
      });

      let nextCalled = false;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: { "x-api-key": issued.key },
      } as never;
      const res = {} as never;
      const next = () => {
        nextCalled = true;
      };

      await authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

      await store.clearDurable();
      process.env.NODE_ENV = originalEnv;
    });

    it("rejects an unregistered API key in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      await getApiKeyStore().clearDurable();

      let statusCode = 0;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: { "x-api-key": "unknown-api-key-123456789" },
      } as never;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return { json: () => undefined };
        },
      } as never;

      authMiddleware(req, res, () => undefined);
      expect(statusCode).toBe(401);

      process.env.NODE_ENV = originalEnv;
    });

    it("rejects an array API key header", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const store = getApiKeyStore();
      await store.clearDurable();
      await store.issueDurable("array-header-api-key-123456", {
        label: "array-test",
      });

      let statusCode = 0;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: { "x-api-key": ["array-header-api-key-123456"] },
      } as never;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return { json: () => undefined };
        },
      } as never;

      authMiddleware(req, res, () => undefined);
      expect(statusCode).toBe(401);

      await store.clearDurable();
      process.env.NODE_ENV = originalEnv;
    });

    it("allows public health endpoint without auth", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      let nextCalled = false;
      const req = { path: "/health", method: "GET", headers: {} } as never;
      const res = {} as never;
      const next = () => {
        nextCalled = true;
      };

      await authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });
  });
});
