import { once } from "node:events";
import type { AddressInfo } from "node:net";
import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { describe, expect, it } from "vitest";
import { AuthService } from "../../platform/auth/AuthService";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../platform/storage/StorageProvider";
import { UserRepository } from "../../platform/users";
import { createPlatformRouter } from "../platform";
import type { ProjectAccessControl } from "../projects";

class RejectableAuthStorage extends InMemoryStorageProvider {
  rejectBatches = false;

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    if (this.rejectBatches) {
      throw new DurableStorageError(
        "injected auth batch rejection",
        "transaction",
      );
    }
    return super.applyDurableBatch(mutations);
  }
}

interface TestContext {
  storage: RejectableAuthStorage;
  auth: AuthService;
  user: { id: string; email: string };
}

interface TestResponse {
  status: number;
  body: Record<string, unknown>;
  setCookie: string | null;
}

function access(): ProjectAccessControl {
  return {
    getRequestUserId: () => "user-1",
    requireAuthenticatedUser: () => "user-1",
    requireProjectAccess: (_req: Request, _res: Response) => true,
  };
}

async function withServer<T>(
  callback: (baseUrl: string, context: TestContext) => Promise<T>,
): Promise<T> {
  const storage = new RejectableAuthStorage();
  const users = new UserRepository(storage);
  const user = users.create({
    email: "owner@example.test",
    displayName: "Owner",
  });
  const auth = new AuthService(storage);
  expect(auth.register(user.email, "correct-password", user.id)).toBe(true);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/platform",
    createPlatformRouter({ storage, access: access(), auth }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}/platform`, {
      storage,
      auth,
      user,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function requestJson(
  url: string,
  options: {
    body?: Record<string, unknown>;
    cookie?: string;
  } = {},
): Promise<TestResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    setCookie: response.headers.get("set-cookie"),
  };
}

describe("platform auth durable HTTP acknowledgement", () => {
  it("returns 503 and no session cookies when login persistence is rejected", async () => {
    await withServer(async (baseUrl, { storage, user }) => {
      storage.rejectBatches = true;
      const result = await requestJson(`${baseUrl}/auth/login`, {
        body: {
          email: user.email,
          password: "correct-password",
        },
      });

      expect(result).toMatchObject({
        status: 503,
        body: {
          success: false,
          error: "Durable storage is temporarily unavailable",
        },
      });
      expect(result.setCookie).toBeNull();
      expect(storage.count("auth_sessions")).toBe(0);
      expect(storage.count("auth_refresh_credentials")).toBe(0);
    });
  });

  it("returns 503 and preserves the old refresh credential on rotation failure", async () => {
    await withServer(async (baseUrl, { storage, auth, user }) => {
      const login = auth.login(user.email, "correct-password", user.id);
      expect(login.success).toBe(true);
      storage.rejectBatches = true;

      const rejected = await requestJson(`${baseUrl}/auth/refresh`, {
        cookie: `roblox_ai_refresh=${login.refreshToken}`,
      });
      expect(rejected.status).toBe(503);
      expect(rejected.setCookie).toBeNull();
      expect(auth.validateToken(login.token!)).not.toBeNull();

      storage.rejectBatches = false;
      const retried = await requestJson(`${baseUrl}/auth/refresh`, {
        cookie: `roblox_ai_refresh=${login.refreshToken}`,
      });
      expect(retried.status).toBe(200);
      expect(retried.setCookie).toContain("roblox_ai_token=");
      expect(auth.validateToken(login.token!)).toBeNull();
    });
  });

  it("returns 503 without clearing cookies when durable logout fails", async () => {
    await withServer(async (baseUrl, { storage, auth, user }) => {
      const login = auth.login(user.email, "correct-password", user.id);
      expect(login.success).toBe(true);
      storage.rejectBatches = true;

      const rejected = await requestJson(`${baseUrl}/auth/logout`, {
        cookie: `roblox_ai_token=${login.token}`,
      });
      expect(rejected.status).toBe(503);
      expect(rejected.setCookie).toBeNull();
      expect(auth.validateToken(login.token!)).not.toBeNull();

      storage.rejectBatches = false;
      const loggedOut = await requestJson(`${baseUrl}/auth/logout`, {
        cookie: `roblox_ai_token=${login.token}`,
      });
      expect(loggedOut.status).toBe(200);
      expect(loggedOut.setCookie).toContain("roblox_ai_token=");
      expect(auth.validateToken(login.token!)).toBeNull();
    });
  });
});
