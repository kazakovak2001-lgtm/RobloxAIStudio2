import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import cookieParser from "cookie-parser";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlatformRouter } from "../routes/platform";
import { createProjectRuntime } from "../routes/projects";
import { AuthService } from "../platform/auth/AuthService";
import { configureAuthService } from "../platform/auth/authServiceInstance";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";

interface TestResponse {
  status: number;
  body: Record<string, unknown>;
  setCookies: string[];
}

interface RequestOptions {
  method?: string;
  body?: Record<string, unknown>;
  cookie?: string;
}

describe("HARDEN-2A auth contract", () => {
  let server: Server;
  let baseUrl: string;
  let previousNodeEnv: string | undefined;

  beforeEach(async () => {
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const storage = new InMemoryStorageProvider();
    const auth = configureAuthService(storage);
    const runtime = createProjectRuntime(storage, auth);
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      "/api/platform",
      createPlatformRouter({ storage, access: runtime.access }),
    );

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("keeps register, login, and refresh bodies credential-free", async () => {
    const credentials = {
      email: "harden-2a@example.test",
      password: "Harden-2A-Secure!",
      displayName: "HARDEN-2A",
    };
    const registration = await request("/api/platform/auth/register", {
      method: "POST",
      body: credentials,
    });

    expect(registration.status).toBe(200);
    expectCredentialFree(registration.body);
    const registeredData = readData(registration.body);
    const registeredUser = registeredData.user as Record<string, unknown>;
    expect(registeredUser.email).toBe(credentials.email);

    const initialAccessCookie = readCookie(
      registration.setCookies,
      "roblox_ai_token",
    );
    const initialRefreshCookie = readCookie(
      registration.setCookies,
      "roblox_ai_refresh",
    );
    expectCookiePolicy(registration.setCookies, "roblox_ai_token", "/");
    expectCookiePolicy(
      registration.setCookies,
      "roblox_ai_refresh",
      "/api/platform/auth/refresh",
    );

    const currentUser = await request("/api/platform/auth/me", {
      cookie: initialAccessCookie,
    });
    expect(currentUser.status).toBe(200);
    expect(
      (readData(currentUser.body).user as Record<string, unknown>).id,
    ).toBe(registeredUser.id);

    const refreshed = await request("/api/platform/auth/refresh", {
      method: "POST",
      cookie: initialRefreshCookie,
    });
    expect(refreshed.status).toBe(200);
    expectCredentialFree(refreshed.body);
    expect(readData(refreshed.body)).toEqual({ refreshed: true });

    const rotatedAccessCookie = readCookie(
      refreshed.setCookies,
      "roblox_ai_token",
    );
    const rotatedRefreshCookie = readCookie(
      refreshed.setCookies,
      "roblox_ai_refresh",
    );
    expect(rotatedRefreshCookie).not.toBe(initialRefreshCookie);

    const replay = await request("/api/platform/auth/refresh", {
      method: "POST",
      cookie: initialRefreshCookie,
    });
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({
      success: false,
      error: "Invalid refresh token",
    });

    const refreshedUser = await request("/api/platform/auth/me", {
      cookie: rotatedAccessCookie,
    });
    expect(refreshedUser.status).toBe(200);

    const secondRotation = await request("/api/platform/auth/refresh", {
      method: "POST",
      cookie: rotatedRefreshCookie,
    });
    expect(secondRotation.status).toBe(200);
    expectCredentialFree(secondRotation.body);

    const login = await request("/api/platform/auth/login", {
      method: "POST",
      body: {
        email: credentials.email,
        password: credentials.password,
      },
    });
    expect(login.status).toBe(200);
    expectCredentialFree(login.body);
    expect((readData(login.body).user as Record<string, unknown>).id).toBe(
      registeredUser.id,
    );
  });

  it("stores only refresh digests and consumes the old credential", () => {
    const storage = new InMemoryStorageProvider();
    const auth = new AuthService(storage);
    auth.register("digest@example.test", "password", "user-digest");
    const login = auth.login("digest@example.test", "password", "user-digest");

    expect(login.success).toBe(true);
    expect(login.refreshToken).toMatch(/^ref_[a-f0-9]{64}$/);
    const stored = storage.list<Record<string, unknown>>("auth_sessions");
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty("refreshToken");
    expect(stored[0]).not.toHaveProperty("refreshExpiresAt");
    expect(stored[0].refreshTokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(login.refreshToken);
    expect(storage.count("auth_refresh_credentials")).toBe(1);
    expect(
      JSON.stringify(storage.list("auth_refresh_credentials")),
    ).not.toContain(login.refreshToken);

    const rotated = auth.refreshSession(login.refreshToken!);
    expect(rotated.success).toBe(true);
    expect(auth.validateToken(login.token!)).toBeNull();
    expect(auth.refreshSession(login.refreshToken!).success).toBe(false);
    expect(auth.validateToken(rotated.token!)).not.toBeNull();
    expect(storage.count("auth_refresh_credentials")).toBe(1);
  });

  it("migrates persisted plaintext refresh credentials without invalidating them", () => {
    const storage = new InMemoryStorageProvider();
    const legacyRefreshToken = "ref_legacy_high_entropy_credential";
    storage.set("auth_sessions", "tok_legacy", {
      sessionId: "legacy-session",
      userId: "legacy-user",
      role: "creator",
      token: "tok_legacy",
      refreshToken: legacyRefreshToken,
      createdAt: Date.now() - 1_000,
      expiresAt: Date.now() + 60_000,
      lastActivity: Date.now() - 1_000,
    });

    const auth = new AuthService(storage);
    const migrated = storage.get<Record<string, unknown>>(
      "auth_sessions",
      "tok_legacy",
    );
    expect(migrated).not.toBeNull();
    expect(migrated).not.toHaveProperty("refreshToken");
    expect(migrated).not.toHaveProperty("refreshExpiresAt");
    expect(migrated?.refreshTokenDigest).toBe(
      createHash("sha256").update(legacyRefreshToken).digest("hex"),
    );
    expect(JSON.stringify(migrated)).not.toContain(legacyRefreshToken);
    expect(storage.count("auth_refresh_credentials")).toBe(1);

    const refreshed = auth.refreshSession(legacyRefreshToken);
    expect(refreshed.success).toBe(true);
    expect(auth.refreshSession(legacyRefreshToken).success).toBe(false);
  });

  it("keeps authoritative auth guidance on opaque-session terminology", () => {
    const authoritativeFiles = [
      ".env.example",
      "server/src/platform/auth/AuthService.ts",
      "server/src/platform/auth/AuthTypes.ts",
      "docs/README.md",
      "docs/00-project-control/CURRENT_STATE.md",
      "docs/00-project-control/ROADMAP_STATUS.md",
      "docs/03-features/authentication.md",
      "docs/PRODUCTION_DEPLOYMENT_GUIDE.md",
      "docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md",
    ];
    const obsoleteClaims = [
      /JWT_SECRET/,
      /\bJWT-like\b/i,
      /\bJWT[- ](?:based|secret|signing|token|validation)\b/i,
      /\bsigned[- ]JWTs?\b/i,
      /\bJWT cryptographic validation\b/i,
      /\bfull cryptographic validation\b/i,
      /\bSameSite(?:\s*[:=]\s*|\s+)Strict\b/i,
    ];

    for (const file of authoritativeFiles) {
      const content = readFileSync(file, "utf8");
      for (const claim of obsoleteClaims) {
        expect(
          content,
          `${file} contains obsolete auth terminology`,
        ).not.toMatch(claim);
      }
    }

    const decisionLog = readFileSync(
      "docs/00-project-control/DECISION_LOG.md",
      "utf8",
    );
    const historicalBoundary =
      "## 2026-07-16 — Final Verification & Release Report (Task 11)";
    expect(decisionLog).toContain(historicalBoundary);
    const currentDecisions = decisionLog.slice(
      0,
      decisionLog.indexOf(historicalBoundary),
    );
    for (const claim of obsoleteClaims) {
      expect(
        currentDecisions,
        `Current decision log contains obsolete auth terminology`,
      ).not.toMatch(claim);
    }

    const supersededHistoricalSections = [
      historicalBoundary,
      "## 2026-07-16 — Production Infrastructure (Task 10)",
      "## 2026-07-16 — Socket.IO JWT Handshake Validation Implemented (Task 7)",
      "## 2026-07-16 — JWT Cryptographic Validation Implemented (Task 6)",
      "## 2026-07-16 — httpOnly Cookie Token Delivery (Task 5)",
    ];
    for (const heading of supersededHistoricalSections) {
      const start = decisionLog.indexOf(heading);
      expect(
        start,
        `Missing historical decision ${heading}`,
      ).toBeGreaterThanOrEqual(0);
      const next = decisionLog.indexOf("\n## ", start + heading.length);
      const section = decisionLog.slice(
        start,
        next === -1 ? decisionLog.length : next,
      );
      expect(
        section,
        `${heading} is missing its DOC-201 supersession note`,
      ).toMatch(/> \*\*Superseded by DOC-201 \(July 28, 2026\):\*\*/);
    }

    const authenticationGuide = readFileSync(
      "docs/03-features/authentication.md",
      "utf8",
    );
    const deploymentGuide = readFileSync(
      "docs/PRODUCTION_DEPLOYMENT_GUIDE.md",
      "utf8",
    );
    const deploymentChecklist = readFileSync(
      "docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md",
      "utf8",
    );
    for (const content of [
      authenticationGuide,
      deploymentGuide,
      deploymentChecklist,
    ]) {
      expect(content).toContain("SameSite=Lax");
      expect(content).toContain("roblox_ai_token");
      expect(content).toContain("roblox_ai_refresh");
      expect(content).toContain("/api/platform/auth/refresh");
    }
    expect(authenticationGuide).toContain("harden2a.auth-contract.test.ts");
    expect(deploymentGuide).toContain("verify-composed-release.mjs");
    expect(deploymentChecklist).toContain("30350138128");
    for (const content of [deploymentGuide, deploymentChecklist]) {
      expect(content).toContain("Dockerfile.backend");
      expect(content).toContain("kazakovak2001-lgtm/Frontend");
      expect(content).toContain("deploy/docker-compose.release.yml");
      expect(content).toContain("release-baseline.inventory.json");
    }
  });

  async function request(
    pathname: string,
    options: RequestOptions = {},
  ): Promise<TestResponse> {
    const response = await fetch(baseUrl + pathname, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = (await response.json()) as Record<string, unknown>;
    return {
      status: response.status,
      body,
      setCookies: readSetCookies(response.headers),
    };
  }
});

function readData(body: Record<string, unknown>): Record<string, unknown> {
  expect(body.success).toBe(true);
  expect(body.data).toBeTypeOf("object");
  return body.data as Record<string, unknown>;
}

function expectCredentialFree(body: Record<string, unknown>): void {
  const data = readData(body);
  expect(data).not.toHaveProperty("token");
  expect(data).not.toHaveProperty("refreshToken");
  expect(JSON.stringify(body)).not.toMatch(/(?:tok|ref)_[a-f0-9]{16,}/);
}

function readSetCookies(headers: {
  get(name: string): string | null;
  getSetCookie?: () => string[];
}): string[] {
  const values = headers.getSetCookie?.();
  if (values && values.length > 0) return values;
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

function readCookie(setCookies: string[], name: string): string {
  const match = setCookies.join(", ").match(new RegExp(`${name}=([^;,\\s]+)`));
  expect(match, `Missing ${name} cookie`).not.toBeNull();
  return `${name}=${match![1]}`;
}

function expectCookiePolicy(
  setCookies: string[],
  name: string,
  path: string,
): void {
  const pathPattern = new RegExp(`;\\s*Path=${escapeRegExp(path)}(?:;|$)`, "i");
  const cookie = setCookies.find(
    (value) =>
      value.startsWith(`${name}=`) &&
      pathPattern.test(value) &&
      !/;\s*Max-Age=0(?:;|$)/i.test(value) &&
      !/Expires=Thu,\s*01\s*Jan\s*1970/i.test(value),
  );
  expect(cookie, `Missing ${name} Set-Cookie header`).toBeDefined();
  expect(cookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(cookie).toMatch(/;\s*Secure(?:;|$)/i);
  expect(cookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
  expect(cookie).toMatch(pathPattern);
  expect(cookie).not.toMatch(/;\s*Domain=/i);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
