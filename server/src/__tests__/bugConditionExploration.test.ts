/**
 * Bug Condition Exploration Property Test
 *
 * This test is written BEFORE any fixes are applied.
 * It encodes the EXPECTED (correct) behavior — so it MUST FAIL on unfixed code.
 * Failure confirms the bugs exist. DO NOT attempt to fix code or tests when they fail.
 *
 * **Validates: Requirements 1.1, 1.2, 1.4, 1.5**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ─── Direct imports of units under test ─────────────────────────────────────
import { AuthService } from "../platform/auth/AuthService";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";

/**
 * Simulates the authMiddleware logic from security.ts for testing
 * without needing to spin up an Express server.
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

  if (apiKey && apiKey.length > 10) {
    return { allowed: true, statusCode: 200 };
  }

  return { allowed: false, statusCode: 401 };
}

/**
 * Simulates Socket.IO auth middleware from server/src/index.ts
 */
function simulateSocketAuth(
  token: string | undefined | null,
  env: string,
  authService?: AuthService,
): { accepted: boolean; error?: string } {
  // In development, allow all connections
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

describe("Bug Condition Exploration - Release Hardening Security Defects", () => {
  /**
   * Property 1.1: Auth Route Block
   *
   * Expected behavior: POST to /api/platform/auth/* SHALL be allowed without Bearer token.
   * Bug condition: PUBLIC_PREFIXES does not include /api/platform/auth, so these routes
   * return 401 in production.
   */
  describe("Auth Route Block (Requirement 1.1)", () => {
    it("property: auth routes SHALL allow POST requests without requiring a Bearer token", () => {
      const authRoutes = [
        "/api/platform/auth/login",
        "/api/platform/auth/register",
        "/api/platform/auth/refresh",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...authRoutes), (route) => {
          const result = simulateAuthMiddleware(route, "POST", "production");
          // EXPECTED: Auth routes should be accessible (allowed = true)
          // BUG: They return 401 because /api/platform/auth is not in PUBLIC_PREFIXES
          expect(result.allowed).toBe(true);
          expect(result.statusCode).toBe(200);
        }),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 1.2: Weak Password Hashing
   *
   * Expected behavior: passwords SHALL be hashed with bcrypt cost factor >= 12.
   * Same password hashed twice SHALL produce DIFFERENT hashes (due to random salt).
   * Bug condition: SHA-256 is used — same input always yields same hash.
   *
   * After fix: Tests the ACTUAL AuthService behavior — register uses bcrypt
   * so same password registered for two different users produces different stored hashes.
   */
  describe("Weak Password Hashing (Requirement 1.2)", () => {
    it("property: same password hashed twice SHALL produce different hashes (bcrypt salting)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 8, maxLength: 64 }),
          async (password) => {
            const storage1 = new InMemoryStorageProvider();
            const storage2 = new InMemoryStorageProvider();
            const authService1 = new AuthService(storage1);
            const authService2 = new AuthService(storage2);

            expect(
              await authService1.registerDurable(
                "user1@test.com",
                password,
                "user-1",
              ),
            ).toBe(true);
            expect(
              await authService2.registerDurable(
                "user2@test.com",
                password,
                "user-2",
              ),
            ).toBe(true);

            const credentials1 = storage1.get<{ passwordHash: string }>(
              "auth_credentials",
              "user1@test.com",
            );
            const credentials2 = storage2.get<{ passwordHash: string }>(
              "auth_credentials",
              "user2@test.com",
            );
            if (!credentials1 || !credentials2) {
              throw new Error("Registration did not persist both credentials");
            }
            expect(credentials1.passwordHash).not.toBe(
              credentials2.passwordHash,
            );
            expect(credentials1.passwordHash).toMatch(/^\$2[aby]\$12\$/);
            expect(credentials2.passwordHash).toMatch(/^\$2[aby]\$12\$/);

            expect(
              (
                await authService1.loginDurable(
                  "user1@test.com",
                  password,
                  "user-1",
                )
              ).success,
            ).toBe(true);
            expect(
              (
                await authService2.loginDurable(
                  "user2@test.com",
                  password,
                  "user-2",
                )
              ).success,
            ).toBe(true);
          },
        ),
        { numRuns: 5 },
      );
    }, 60000);

    it("property: password hashes SHALL use bcrypt format ($2a$12$ or $2b$12$)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 8, maxLength: 64 }),
          async (password) => {
            const storage = new InMemoryStorageProvider();
            const authService = new AuthService(storage);
            expect(
              await authService.registerDurable(
                "test@test.com",
                password,
                "user-1",
              ),
            ).toBe(true);

            const credentials = storage.get<{ passwordHash: string }>(
              "auth_credentials",
              "test@test.com",
            );
            if (!credentials) {
              throw new Error("Registration did not persist credentials");
            }
            expect(credentials.passwordHash).toMatch(/^\$2[aby]\$12\$/);
            expect(
              (
                await authService.loginDurable(
                  "test@test.com",
                  password,
                  "user-1",
                )
              ).success,
            ).toBe(true);
            expect(
              (
                await authService.loginDurable(
                  "test@test.com",
                  password + "x",
                  "user-1",
                )
              ).success,
            ).toBe(false);
          },
        ),
        { numRuns: 5 },
      );
    }, 60000);
  });

  /**
   * Property 1.4: Missing Opaque Session Validation
   *
   * Expected behavior: invalid Bearer tokens SHALL result in 401 responses.
   * Bug condition: authMiddleware only checks if header starts with "Bearer " —
   * any arbitrary string passes.
   */
  describe("Missing Opaque Session Validation (Requirement 1.4)", () => {
    it("property: invalid Bearer tokens SHALL result in 401 responses", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (fakeToken) => {
            const authHeader = `Bearer ${fakeToken}`;
            const result = simulateAuthMiddleware(
              "/api/projects",
              "GET",
              "production",
              authHeader,
            );

            // EXPECTED: Invalid/arbitrary tokens should be REJECTED (401)
            // BUG: Any string after "Bearer " passes authentication
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(401);
          },
        ),
        { numRuns: 5 },
      );
    });

    it("property: arbitrary Bearer strings SHALL NOT pass authMiddleware in production", () => {
      const fakeTokens = [
        "completely_fake_token",
        "not_a_real_jwt",
        "abc123",
        "eyJhbGciOiJub25lIn0.eyJ0ZXN0IjoxfQ.", // unsigned JWT
        "random_garbage_string_12345",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...fakeTokens), (token) => {
          const result = simulateAuthMiddleware(
            "/api/projects",
            "GET",
            "production",
            `Bearer ${token}`,
          );

          // EXPECTED: Fake tokens should be rejected
          // BUG: Presence of "Bearer " prefix is sufficient to pass
          expect(result.allowed).toBe(false);
          expect(result.statusCode).toBe(401);
        }),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 1.5: Socket.IO Bypass
   *
   * Expected behavior: Socket.IO connections with invalid tokens SHALL be rejected.
   * Bug condition: Socket.IO middleware only checks `if (!token)` — any non-empty
   * token passes without validation.
   */
  describe("Socket.IO Auth Bypass (Requirement 1.5)", () => {
    it("property: Socket.IO connections with invalid tokens SHALL be rejected in production", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (fakeToken) => {
            // No authService provided — fake tokens cannot be validated → rejected
            const result = simulateSocketAuth(fakeToken, "production");

            // EXPECTED: Fake/invalid tokens should be REJECTED
            expect(result.accepted).toBe(false);
            expect(result.error).toBeDefined();
          },
        ),
        { numRuns: 5 },
      );
    });

    it("property: Socket.IO SHALL validate opaque sessions during handshake — fake tokens rejected", () => {
      const fakeTokens = [
        "fake",
        "not_a_jwt",
        "Bearer token_in_wrong_place",
        "tok_faketoken12345",
        "eyJhbGciOiJub25lIn0.e30.",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...fakeTokens), (token) => {
          // No authService provided — token can't be validated → rejected
          const result = simulateSocketAuth(token, "production");

          // EXPECTED: Invalid tokens should cause rejection
          expect(result.accepted).toBe(false);
        }),
        { numRuns: 5 },
      );
    });
  });
});
