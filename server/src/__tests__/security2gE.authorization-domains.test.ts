import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { authMiddleware } from "../common/middleware/security";
import { AuthService } from "../platform/auth/AuthService";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { createPlatformRouter } from "../routes/platform";
import { createProjectRuntime } from "../routes/projects";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function listen(app: express.Express): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Registers a user and returns its session token.
 *
 * TEST-EVIDENCE-1. This used to register and then log in, which paid for two
 * cost-12 bcrypt operations per identity, and with two identities that was four
 * before a single request was made. `prepareRegistration` already returns the
 * session for the registration it prepares, so one hash is enough. It is also
 * the same path the production register route uses, so the fixture is closer to
 * real behaviour than the register-then-login pair was.
 */
async function tokenFor(
  auth: AuthService,
  storage: InMemoryStorageProvider,
  email: string,
  userId: string,
): Promise<string> {
  const prepared = await auth.prepareRegistration(email, "password123", userId);
  await storage.applyDurableBatch(prepared.mutations);
  return prepared.loginResult.token!;
}

describe("SECURITY-2G-E initial authorization domains", () => {
  it("allows only the declared public system and auth paths without credentials", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const allowed = [
      ["GET", "/health"],
      ["GET", "/"],
      ["POST", "/api/platform/auth/login"],
      ["POST", "/api/platform/auth/register"],
      ["POST", "/api/platform/auth/refresh"],
      ["POST", "/api/platform/auth/logout"],
      ["POST", "/api/platform/auth/forgot-password"],
    ] as const;

    try {
      for (const [method, path] of allowed) {
        let passed = false;
        await authMiddleware(
          { method, path, headers: {} } as never,
          {
            status: () => ({ json: () => undefined }),
          } as never,
          () => {
            passed = true;
          },
        );
        expect(passed, `${method} ${path}`).toBe(true);
      }

      let protectedPassed = false;
      let protectedStatus = 0;
      await authMiddleware(
        { method: "GET", path: "/api/platform/auth/me", headers: {} } as never,
        {
          status: (status: number) => {
            protectedStatus = status;
            return { json: () => undefined };
          },
        } as never,
        () => {
          protectedPassed = true;
        },
      );
      expect(protectedPassed).toBe(false);
      expect(protectedStatus).toBe(401);

      for (const protectedPath of [
        "/api/system/status",
        "/api/system/agents",
      ]) {
        let passed = false;
        let status = 0;
        await authMiddleware(
          { method: "GET", path: protectedPath, headers: {} } as never,
          {
            status: (value: number) => {
              status = value;
              return { json: () => undefined };
            },
          } as never,
          () => {
            passed = true;
          },
        );
        expect(passed, protectedPath).toBe(false);
        expect(status, protectedPath).toBe(401);
      }
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("enforces user-self access for profile, preferences, and limits", async () => {
    const storage = new InMemoryStorageProvider();
    const auth = new AuthService(storage);
    const runtime = createProjectRuntime(storage, auth);
    const ownerToken = await tokenFor(
      auth,
      storage,
      "owner@example.com",
      "owner",
    );
    const otherToken = await tokenFor(
      auth,
      storage,
      "other@example.com",
      "other",
    );
    const app = express();
    app.use(express.json());
    app.use(
      "/api/platform",
      createPlatformRouter({ storage, access: runtime.access, auth }),
    );
    const base = await listen(app);

    const cases = [
      ["GET", "/users/owner"],
      ["PATCH", "/users/owner"],
      ["GET", "/users/owner/preferences"],
      ["PUT", "/users/owner/preferences"],
      ["GET", "/users/owner/limits"],
    ] as const;

    for (const [method, path] of cases) {
      const owner = await fetch(`${base}/api/platform${path}`, {
        method,
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json",
        },
        body: method === "GET" ? undefined : "{}",
      });
      expect(owner.status, `${method} ${path} owner`).not.toBe(401);
      expect(owner.status, `${method} ${path} owner`).not.toBe(403);

      const foreign = await fetch(`${base}/api/platform${path}`, {
        method,
        headers: {
          authorization: `Bearer ${otherToken}`,
          "content-type": "application/json",
        },
        body: method === "GET" ? undefined : "{}",
      });
      expect(foreign.status, `${method} ${path} foreign`).toBe(403);
    }
  });
});
