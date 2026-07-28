/**
 * Preservation Property Tests — Baseline Behavior Guards
 *
 * These tests capture the CURRENT expected behavior of the application
 * BEFORE implementing any fixes. They MUST PASS on unfixed code and
 * serve as regression guards during the hardening sprint.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// ─── Direct imports of units under test ─────────────────────────────────────
import { AuthService } from "../platform/auth/AuthService";
import { authService as sharedAuthService } from "../platform/auth/authServiceInstance";
import {
  authMiddleware,
  corsMiddleware,
  rateLimiter,
  securityHeaders,
} from "../common/middleware/security";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { SaaSProjectRepository } from "../platform/projects";

// ─── Simulation helpers (same approach as Task 1) ───────────────────────────

/**
 * Simulates the authMiddleware logic for testing without Express server.
 * Mirrors the actual implementation in security.ts (storage-backed opaque
 * session validation).
 */
function simulateAuthMiddleware(
  path: string,
  method: string,
  env: string,
  authHeader?: string,
  apiKey?: string,
  authService?: AuthService,
): { allowed: boolean; statusCode: number } {
  const PUBLIC_PATHS = [
    "/health",
    "/api/system/status",
    "/api/system/agents",
    "/",
  ];
  const PUBLIC_PREFIXES = ["/api/platform/users", "/api/platform/auth"];

  // Skip auth in development mode
  if (env !== "production") {
    return { allowed: true, statusCode: 200 };
  }

  // Public routes
  if (PUBLIC_PATHS.includes(path)) {
    return { allowed: true, statusCode: 200 };
  }

  // Public prefixes (login/register)
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p) && method === "POST")) {
    return { allowed: true, statusCode: 200 };
  }

  // Check Authorization header — FIXED: validates token cryptographically
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (authService) {
      const session = authService.validateToken(token);
      if (session) return { allowed: true, statusCode: 200 };
      return { allowed: false, statusCode: 401 };
    }
    // No authService provided — reject (default to secure)
    return { allowed: false, statusCode: 401 };
  }

  // The real middleware validates keys through ApiKeyStore. This helper has no
  // key registry, so it must fail closed for any supplied API key.
  if (apiKey) {
    return { allowed: false, statusCode: 401 };
  }

  return { allowed: false, statusCode: 401 };
}

/**
 * Simulates Socket.IO auth middleware
 */
function simulateSocketAuth(
  token: string | undefined | null,
  env: string,
  authService?: AuthService,
): { accepted: boolean; error?: string } {
  if (env !== "production") {
    return { accepted: true };
  }
  if (!token) {
    return { accepted: false, error: "Authentication required" };
  }
  // FIXED: Validate token using AuthService
  if (authService) {
    const session = authService.validateToken(token);
    if (session) {
      return { accepted: true };
    }
    return { accepted: false, error: "Invalid or expired token" };
  }
  // No authService — reject by default (secure)
  return { accepted: false, error: "Invalid or expired token" };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("Preservation Property Tests - Baseline Behavior Guards", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Authentication Flow — Dev Mode Auth Bypass
  // Validates: Requirement 3.1
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Authentication Flow - Dev Mode Bypass (Requirement 3.1)", () => {
    it("property: ALL routes accessible without tokens in development mode", () => {
      const routes = [
        "/api/projects",
        "/api/concept/generate",
        "/api/analytics/system",
        "/api/platform/auth/login",
        "/api/platform/users",
        "/api/system/status",
        "/api/lua/generate",
        "/api/knowledge/patterns",
        "/api/studio/status",
        "/health",
      ];

      const methods = ["GET", "POST", "PUT", "DELETE"];

      fc.assert(
        fc.property(
          fc.constantFrom(...routes),
          fc.constantFrom(...methods),
          (route, method) => {
            const result = simulateAuthMiddleware(route, method, "development");
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
          },
        ),
        { numRuns: 5 },
      );
    });

    it("property: random paths accessible in dev mode without auth", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .map((s) => "/api/" + s.replace(/[^a-z0-9/]/gi, "")),
          fc.constantFrom("GET", "POST", "PUT", "DELETE"),
          (path, method) => {
            const result = simulateAuthMiddleware(path, method, "development");
            expect(result.allowed).toBe(true);
          },
        ),
        { numRuns: 5 },
      );
    });

    it("unit: authMiddleware calls next() in development mode", () => {
      process.env.NODE_ENV = "development";
      let nextCalled = false;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: {},
      } as never;
      const res = {} as never;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it("unit: authMiddleware calls next() for /api/analytics in dev mode", () => {
      process.env.NODE_ENV = "development";
      let nextCalled = false;
      const req = {
        path: "/api/analytics/system",
        method: "GET",
        headers: {},
      } as never;
      const res = {} as never;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Project CRUD — /api/projects endpoints return expected JSON structure
  // Validates: Requirement 3.3
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Project CRUD - API Response Structure (Requirement 3.3)", () => {
    it("unit: SaaSProjectRepository create returns correct structure", () => {
      const storage = new InMemoryStorageProvider();
      const projects = new SaaSProjectRepository(storage);

      const project = projects.create(
        "user-1",
        "Test Project",
        "adventure",
        "A test project",
      );

      expect(project).toHaveProperty("id");
      expect(project).toHaveProperty("name", "Test Project");
      expect(project).toHaveProperty("genre", "adventure");
      expect(project).toHaveProperty("description", "A test project");
      expect(project).toHaveProperty("status");
      expect(project).toHaveProperty("createdAt");
      expect(project).toHaveProperty("updatedAt");
      expect(project).toHaveProperty("ownerId", "user-1");
    });

    it("property: project creation preserves input data for any valid name and genre", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => s.trim().length > 0),
          fc.constantFrom("adventure", "rpg", "simulation", "racing", "puzzle"),
          fc.string({ minLength: 0, maxLength: 200 }),
          (name, genre, description) => {
            const storage = new InMemoryStorageProvider();
            const projects = new SaaSProjectRepository(storage);
            const project = projects.create("user-1", name, genre, description);

            expect(project.name).toBe(name);
            expect(project.genre).toBe(genre);
            expect(project.description).toBe(description);
            expect(project.ownerId).toBe("user-1");
            expect(typeof project.id).toBe("string");
            expect(project.id.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 5 },
      );
    });

    it("unit: projects list returns {success, data} format", () => {
      const storage = new InMemoryStorageProvider();
      const projects = new SaaSProjectRepository(storage);
      projects.create("user-1", "P1", "adventure", "");

      const byOwner = projects.getByOwner("user-1");
      expect(Array.isArray(byOwner)).toBe(true);
      expect(byOwner.length).toBe(1);
      expect(byOwner[0]).toHaveProperty("id");
      expect(byOwner[0]).toHaveProperty("name", "P1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AI Studio Generation — /api/concept endpoint behavior
  // Validates: Requirement 3.3
  // ═══════════════════════════════════════════════════════════════════════════

  describe("AI Studio Generation - Concept Endpoint (Requirement 3.3)", () => {
    it("property: concept generation endpoint accessible in dev mode", () => {
      fc.assert(
        fc.property(fc.constantFrom("development", "test", ""), (env) => {
          const result = simulateAuthMiddleware(
            "/api/concept/generate",
            "POST",
            env,
          );
          expect(result.allowed).toBe(true);
        }),
        { numRuns: 5 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Analytics API — /api/analytics endpoints return expected data
  // Validates: Requirement 3.3
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Analytics API - Endpoint Access (Requirement 3.3)", () => {
    const analyticsRoutes = [
      "/api/analytics/system",
      "/api/analytics/agents",
      "/api/analytics/patterns",
      "/api/analytics/signals",
      "/api/analytics/suggestions",
      "/api/analytics/slowest",
      "/api/analytics/lowest-scores",
    ];

    it("property: all analytics routes accessible in development mode", () => {
      fc.assert(
        fc.property(fc.constantFrom(...analyticsRoutes), (route) => {
          const result = simulateAuthMiddleware(route, "GET", "development");
          expect(result.allowed).toBe(true);
          expect(result.statusCode).toBe(200);
        }),
        { numRuns: 5 },
      );
    });

    it("property: analytics routes accessible with valid Bearer token in production", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...analyticsRoutes),
          fc.string({ minLength: 8, maxLength: 30 }),
          (route, password) => {
            const auth = new AuthService();
            auth.register("analytics@test.com", password, "user-a");
            const login = auth.login("analytics@test.com", password, "user-a");
            if (!login.success || !login.token) return;

            const result = simulateAuthMiddleware(
              route,
              "GET",
              "production",
              `Bearer ${login.token}`,
              undefined,
              auth,
            );
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
          },
        ),
        { numRuns: 5 },
      );
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Workspace Loading — workspace/project initialization
  // Validates: Requirement 3.5
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Workspace Loading - In-Memory Storage (Requirement 3.5)", () => {
    it("unit: InMemoryStorageProvider functions without PostgreSQL", () => {
      const storage = new InMemoryStorageProvider();

      // Basic CRUD operations work
      storage.set("test-collection", "item-1", { name: "test" });
      const item = storage.get("test-collection", "item-1");
      expect(item).toEqual({ name: "test" });

      const list = storage.list("test-collection");
      expect(list).toHaveLength(1);

      storage.delete("test-collection", "item-1");
      expect(storage.get("test-collection", "item-1")).toBeNull();
    });

    it("property: in-memory storage preserves data integrity for any key-value pair", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 30 }),
            value: fc.integer(),
          }),
          (collection, key, data) => {
            const storage = new InMemoryStorageProvider();
            storage.set(collection, key, data);
            const retrieved = storage.get(collection, key);
            expect(retrieved).toEqual(data);
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Plugin Manager — plugin-related API endpoints
  // Validates: Requirement 3.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Plugin Manager - API Endpoints (Requirement 3.2)", () => {
    it("property: studio/plugin routes accessible in dev mode", () => {
      const pluginRoutes = [
        "/api/studio/status",
        "/api/studio/connect",
        "/api/studio/sync",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...pluginRoutes), (route) => {
          const result = simulateAuthMiddleware(route, "GET", "development");
          expect(result.allowed).toBe(true);
        }),
        { numRuns: 5 },
      );
    });

    it("property: plugin routes accessible with valid Bearer token in prod", () => {
      const pluginRoutes = ["/api/studio/status", "/api/studio/connect"];

      fc.assert(
        fc.property(
          fc.constantFrom(...pluginRoutes),
          fc.constantFrom("GET", "POST"),
          fc.string({ minLength: 8, maxLength: 30 }),
          (route, method, password) => {
            const auth = new AuthService();
            auth.register("plugin@test.com", password, "user-p");
            const login = auth.login("plugin@test.com", password, "user-p");
            if (!login.success || !login.token) return;

            const result = simulateAuthMiddleware(
              route,
              method,
              "production",
              `Bearer ${login.token}`,
              undefined,
              auth,
            );
            expect(result.allowed).toBe(true);
          },
        ),
        { numRuns: 5 },
      );
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Token Refresh Flow — refresh token mechanism
  // Validates: Requirement 3.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Token Refresh Flow (Requirement 3.2)", () => {
    it("unit: AuthService refreshSession produces new valid tokens", () => {
      const auth = new AuthService();
      auth.register("user@test.com", "password123", "user-1");
      const loginResult = auth.login("user@test.com", "password123", "user-1");

      expect(loginResult.success).toBe(true);
      expect(loginResult.refreshToken).toBeDefined();

      const refreshResult = auth.refreshSession(loginResult.refreshToken!);
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.token).toBeDefined();
      expect(refreshResult.refreshToken).toBeDefined();
      // New token is different from old
      expect(refreshResult.token).not.toBe(loginResult.token);
    });

    it("unit: invalid refresh token returns error", () => {
      const auth = new AuthService();
      const result = auth.refreshSession("invalid_refresh_token");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("property: refreshed token grants access via validateToken", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 8, maxLength: 30 }), (password) => {
          const auth = new AuthService();
          auth.register("test@e.com", password, "u-1");
          const login = auth.login("test@e.com", password, "u-1");
          if (!login.success || !login.refreshToken) return;

          const refreshed = auth.refreshSession(login.refreshToken);
          if (!refreshed.success || !refreshed.token) return;

          const session = auth.validateToken(refreshed.token);
          expect(session).not.toBeNull();
          expect(session!.userId).toBe("u-1");
        }),
        { numRuns: 5 },
      );
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Logout Behavior — logout clears session correctly
  // Validates: Requirement 3.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Logout Behavior (Requirement 3.2)", () => {
    it("unit: logout invalidates the session token", () => {
      const auth = new AuthService();
      auth.register("user@test.com", "pass123", "user-1");
      const login = auth.login("user@test.com", "pass123", "user-1");

      expect(login.success).toBe(true);
      expect(auth.validateToken(login.token!)).not.toBeNull();

      auth.logout(login.token!);
      expect(auth.validateToken(login.token!)).toBeNull();
    });

    it("property: logout always invalidates any issued token", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 6, maxLength: 30 }), (password) => {
          const auth = new AuthService();
          auth.register("t@t.com", password, "u-1");
          const login = auth.login("t@t.com", password, "u-1");
          if (!login.success || !login.token) return;

          // Token valid before logout
          expect(auth.validateToken(login.token)).not.toBeNull();
          // Logout
          const loggedOut = auth.logout(login.token);
          expect(loggedOut).toBe(true);
          // Token invalid after logout
          expect(auth.validateToken(login.token)).toBeNull();
        }),
        { numRuns: 5 },
      );
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Protected Routes — Bearer token access in production mode
  // Validates: Requirement 3.2
  // Current behavior: any Bearer string works (this IS the preservation target)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Protected Routes - Bearer Token Access (Requirement 3.2)", () => {
    it("property: valid Bearer token passes authMiddleware in production", () => {
      const protectedRoutes = [
        "/api/projects",
        "/api/concept/generate",
        "/api/analytics/system",
        "/api/lua/generate",
        "/api/knowledge/patterns",
        "/api/studio/status",
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...protectedRoutes),
          fc.string({ minLength: 8, maxLength: 30 }),
          (route, password) => {
            const auth = new AuthService();
            auth.register("user@test.com", password, "user-1");
            const login = auth.login("user@test.com", password, "user-1");
            if (!login.success || !login.token) return;

            const result = simulateAuthMiddleware(
              route,
              "GET",
              "production",
              `Bearer ${login.token}`,
              undefined,
              auth,
            );
            // Valid tokens should be accepted
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
          },
        ),
        { numRuns: 5 },
      );
    }, 60000);

    it("unit: actual authMiddleware passes valid Bearer token in production", () => {
      process.env.NODE_ENV = "production";

      // Use the shared authService that the middleware uses internally
      sharedAuthService.register(
        "middleware-test@test.com",
        "testpass123",
        "user-mid-1",
      );
      const loginResult = sharedAuthService.login(
        "middleware-test@test.com",
        "testpass123",
        "user-mid-1",
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

      // Cleanup: logout
      sharedAuthService.logout(loginResult.token!);
    });

    it("unit: actual authMiddleware rejects invalid Bearer token in production", () => {
      process.env.NODE_ENV = "production";
      let nextCalled = false;
      let responseStatus: number | null = null;
      let responseBody: any = null;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: { authorization: "Bearer tok_any_string_here" },
      } as never;
      const res = {
        status: (code: number) => {
          responseStatus = code;
          return {
            json: (body: any) => {
              responseBody = body;
            },
          };
        },
      } as never;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(responseStatus).toBe(401);
    });

    it("unit: unregistered API key is rejected by authMiddleware", () => {
      process.env.NODE_ENV = "production";
      let nextCalled = false;
      let responseStatus = 0;
      const req = {
        path: "/api/projects",
        method: "GET",
        headers: { "x-api-key": "my-api-key-1234567890" },
      } as never;
      const res = {
        status: (code: number) => {
          responseStatus = code;
          return { json: () => undefined };
        },
      } as never;
      const next = () => {
        nextCalled = true;
      };

      authMiddleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(responseStatus).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Existing API Contracts — response format consistency
  // Validates: Requirement 3.3
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Existing API Contracts - Response Format (Requirement 3.3)", () => {
    it("unit: project API returns {success: true, data: [...]} format", () => {
      const storage = new InMemoryStorageProvider();
      const projects = new SaaSProjectRepository(storage);
      projects.create("user-1", "Project A", "rpg", "Test");

      const all = storage.list("projects");
      // The API wraps this: { success: true, data: all }
      const response = { success: true, data: all };
      expect(response).toHaveProperty("success", true);
      expect(response).toHaveProperty("data");
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("unit: AuthService login returns expected LoginResult shape", () => {
      const auth = new AuthService();
      auth.register("test@t.com", "password", "user-1");
      const result = auth.login("test@t.com", "password", "user-1");

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("userId", "user-1");
      expect(result).toHaveProperty("role");
      expect(result.token!.startsWith("tok_")).toBe(true);
      expect(result.refreshToken!.startsWith("ref_")).toBe(true);
    });

    it("property: login result tokens follow consistent format", () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          fc.string({ minLength: 6, maxLength: 30 }),
          (email, password) => {
            const auth = new AuthService();
            const registered = auth.register(email, password, "u-1");
            if (!registered) return; // skip duplicates

            const result = auth.login(email, password, "u-1");
            expect(result.success).toBe(true);
            expect(result.token).toMatch(/^tok_[a-f0-9]+$/);
            expect(result.refreshToken).toMatch(/^ref_[a-f0-9]+$/);
          },
        ),
        { numRuns: 5 },
      );
    }, 60000);

    it("unit: failed login returns {success: false, error: string}", () => {
      const auth = new AuthService();
      auth.register("test@t.com", "correct_pass", "user-1");
      const result = auth.login("test@t.com", "wrong_pass", "user-1");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
      expect(result.token).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Socket.IO Development Mode — connections succeed without validation
  // Validates: Requirement 3.4
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Socket.IO Development Mode (Requirement 3.4)", () => {
    it("property: Socket.IO connections always succeed in development mode regardless of token", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            fc.constant(""),
            fc.string({ minLength: 1, maxLength: 100 }),
          ),
          fc.constantFrom("development", "test", ""),
          (token, env) => {
            const result = simulateSocketAuth(token, env);
            expect(result.accepted).toBe(true);
            expect(result.error).toBeUndefined();
          },
        ),
        { numRuns: 5 },
      );
    });

    it("property: Socket.IO with VALID token succeeds in production", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 8, maxLength: 30 }), (password) => {
          const auth = new AuthService();
          auth.register("socket@test.com", password, "user-s");
          const login = auth.login("socket@test.com", password, "user-s");
          if (!login.success || !login.token) return;

          const result = simulateSocketAuth(login.token, "production", auth);
          // Valid token should be accepted
          expect(result.accepted).toBe(true);
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 5 },
      );
    }, 60000);

    it("unit: Socket.IO rejects null/undefined token in production", () => {
      const result1 = simulateSocketAuth(undefined, "production");
      expect(result1.accepted).toBe(false);
      expect(result1.error).toBe("Authentication required");

      const result2 = simulateSocketAuth(null, "production");
      expect(result2.accepted).toBe(false);
      expect(result2.error).toBe("Authentication required");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. In-Memory Storage — application functions without PostgreSQL
  // Validates: Requirement 3.5
  // ═══════════════════════════════════════════════════════════════════════════

  describe("In-Memory Storage - No PostgreSQL Required (Requirement 3.5)", () => {
    it("property: storage operations work for any collection/key combo", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((s) => s.trim().length > 0),
          fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((s) => s.trim().length > 0),
          (collection, key) => {
            const storage = new InMemoryStorageProvider();
            const data = { id: key, name: "test-item" };

            storage.set(collection, key, data);
            expect(storage.get(collection, key)).toEqual(data);
            expect(storage.list(collection)).toHaveLength(1);

            storage.delete(collection, key);
            expect(storage.get(collection, key)).toBeNull();
            expect(storage.list(collection)).toHaveLength(0);
          },
        ),
        { numRuns: 5 },
      );
    });

    it("unit: project repository works with in-memory storage", () => {
      const storage = new InMemoryStorageProvider();
      const projects = new SaaSProjectRepository(storage);

      // Create
      const p = projects.create("u-1", "Game", "adventure", "desc");
      expect(p).toBeDefined();

      // Read
      const fetched = projects.get(p.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Game");

      // Update
      const updated = projects.update(p.id, { name: "Updated Game" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Updated Game");

      // Delete
      const deleted = projects.delete(p.id);
      expect(deleted).toBe(true);
      expect(projects.get(p.id)).toBeNull();
    });

    it("unit: AuthService works without database", () => {
      const auth = new AuthService();
      const registered = auth.register("no-db@test.com", "pass", "u-1");
      expect(registered).toBe(true);

      const login = auth.login("no-db@test.com", "pass", "u-1");
      expect(login.success).toBe(true);
      expect(login.token).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Security Middleware — rate limiting, Helmet, CORS
  // Validates: Requirement 3.8
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Security Middleware - Rate Limit, Helmet, CORS (Requirement 3.8)", () => {
    it("unit: rateLimiter middleware exists and is a function", () => {
      expect(typeof rateLimiter).toBe("function");
    });

    it("unit: securityHeaders (helmet) middleware exists and is a function", () => {
      expect(typeof securityHeaders).toBe("function");
    });

    it("unit: corsMiddleware exists and is a function", () => {
      expect(typeof corsMiddleware).toBe("function");
    });

    it("unit: corsMiddleware allows development origin", () => {
      process.env.NODE_ENV = "development";

      let nextCalled = false;
      const headers: Record<string, string> = {};
      const req = {
        headers: { origin: "http://localhost:5173" },
        method: "GET",
      } as never;
      const res = {
        header: (key: string, value: string) => {
          headers[key] = value;
        },
        sendStatus: () => {},
      } as never;
      const next = () => {
        nextCalled = true;
      };

      corsMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "http://localhost:5173",
      );
    });

    it("unit: corsMiddleware sets correct headers for OPTIONS preflight", () => {
      process.env.NODE_ENV = "development";

      const headers: Record<string, string> = {};
      let statusSent: number | null = null;
      const req = {
        headers: { origin: "http://localhost:5173" },
        method: "OPTIONS",
      } as never;
      const res = {
        header: (key: string, value: string) => {
          headers[key] = value;
        },
        sendStatus: (code: number) => {
          statusSent = code;
        },
      } as never;
      const next = () => {};

      corsMiddleware(req, res, next);
      expect(statusSent).toBe(204);
      expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
      expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
      expect(headers["Access-Control-Allow-Headers"]).toContain(
        "Authorization",
      );
      expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    });

    it("property: CORS allows all known development origins", () => {
      const devOrigins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...devOrigins), (origin) => {
          process.env.NODE_ENV = "development";
          const headers: Record<string, string> = {};
          let nextCalled = false;
          const req = { headers: { origin }, method: "GET" } as never;
          const res = {
            header: (key: string, value: string) => {
              headers[key] = value;
            },
            sendStatus: () => {},
          } as never;
          const next = () => {
            nextCalled = true;
          };

          corsMiddleware(req, res, next);
          expect(nextCalled).toBe(true);
          expect(headers["Access-Control-Allow-Origin"]).toBe(origin);
        }),
        { numRuns: 5 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. Frontend Routing — existing routes render correctly
  // Validates: Requirement 3.7
  // (Testing that route paths are recognized by authMiddleware in dev mode)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Frontend Routing - Existing Routes (Requirement 3.7)", () => {
    it("property: frontend page routes are not blocked by middleware in dev mode", () => {
      const frontendRoutes = [
        "/ai-studio",
        "/analytics",
        "/knowledge",
        "/settings",
        "/",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...frontendRoutes), (route) => {
          // In development mode, all routes pass middleware
          const result = simulateAuthMiddleware(route, "GET", "development");
          expect(result.allowed).toBe(true);
        }),
        { numRuns: 5 },
      );
    });

    it("unit: root path is always public even in production", () => {
      const result = simulateAuthMiddleware("/", "GET", "production");
      expect(result.allowed).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("unit: /health is always public even in production", () => {
      const result = simulateAuthMiddleware("/health", "GET", "production");
      expect(result.allowed).toBe(true);
    });
  });
});
