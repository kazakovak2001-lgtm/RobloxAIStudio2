/**
 * Security Hardening Tests — Verify middleware behavior.
 */

import { describe, it, expect } from "vitest";
import {
  rateLimiter,
  securityHeaders,
  corsMiddleware,
  authMiddleware,
  requestLogger,
} from "../common/middleware/security";
import { authService } from "../platform/auth/authServiceInstance";

describe("Security Hardening", () => {
  describe("Middleware exports", () => {
    it("rateLimiter is a function", () => {
      expect(typeof rateLimiter).toBe("function");
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

    it("allows API key in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      let nextCalled = false;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: { "x-api-key": "my-api-key-1234567" },
      } as never;
      const res = {} as never;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);

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
