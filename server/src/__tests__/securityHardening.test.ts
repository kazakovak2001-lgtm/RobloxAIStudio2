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
import { authService } from "../platform/auth/authServiceInstance";

describe("Security Hardening", () => {
  describe("Middleware exports", () => {
    it("rateLimiter is a function", () => {
      expect(typeof rateLimiter).toBe("function");
    });

    it("loginRateLimiter is a function", () => {
      expect(typeof loginRateLimiter).toBe("function");
    });

    it("securityHeaders (helmet) is a function", () => {
      expect(typeof securityHeaders).toBe("function");
    });

    it("corsMiddleware is a function", () => {
      expect(typeof corsMiddleware).toBe("function");
    });

    it("authMiddleware is a function", () => {
      expect(typeof authMiddleware).toBe("function");
    });

    it("requestLogger is a function", () => {
      expect(typeof requestLogger).toBe("function");
    });
  });

  describe("Auth middleware logic", () => {
    it("skips auth in non-production (NODE_ENV !== production)", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      let nextCalled = false;
      const req = { path: "/api/protected", headers: {} } as never;
      const res = { status: () => ({ json: () => {} }) } as never;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it("rejects unauthenticated request in production", () => {
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

      authMiddleware(req, res, next);
      expect(statusCode).toBe(401);
      expect((responseBody as { error: string }).error).toContain(
        "Authentication",
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("allows Bearer token in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      // Register and login to get a valid token from the shared authService
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

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

      // Cleanup
      authService.logout(loginResult.token!);
      process.env.NODE_ENV = originalEnv;
    });

    it("allows a registered API key in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const store = getApiKeyStore();
      await store.clearDurable();
      const issued = store.issue("my-api-key-1234567", {
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

      authMiddleware(req, res, next);
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
      store.issue("array-header-api-key-123456", { label: "array-test" });

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

    it("allows public health endpoint without auth", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      let nextCalled = false;
      const req = { path: "/health", method: "GET", headers: {} } as never;
      const res = {} as never;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });
  });
});
