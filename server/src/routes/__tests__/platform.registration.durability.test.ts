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
} from "../../platform/storage/StorageProvider";
import { UserRepository } from "../../platform/users/UserRepository";
import { createPlatformRouter } from "../platform";
import type { ProjectAccessControl } from "../projects";

class RejectableRegistrationStorage extends InMemoryStorageProvider {
  rejectBatch = false;

  override async mutateDurably(
    mutations: readonly DurableMutation[],
  ): Promise<void> {
    if (this.rejectBatch) {
      throw new DurableStorageError("injected registration rejection", "batch");
    }
    await super.mutateDurably(mutations);
  }
}

interface TestContext {
  storage: RejectableRegistrationStorage;
  users: UserRepository;
  auth: AuthService;
}

function access(): ProjectAccessControl {
  return {
    getRequestUserId: () => null,
    requireAuthenticatedUser: () => null,
    requireProjectAccess: (_req: Request, _res: Response) => true,
  };
}

async function withServer<T>(
  callback: (baseUrl: string, context: TestContext) => Promise<T>,
): Promise<T> {
  const storage = new RejectableRegistrationStorage();
  const users = new UserRepository(storage);
  const auth = new AuthService(storage);
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
      users,
      auth,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function register(
  baseUrl: string,
  overrides: Record<string, unknown> = {},
): Promise<{
  status: number;
  body: Record<string, unknown>;
  setCookie: string | null;
}> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "owner@example.test",
      password: "correct-password",
      displayName: "Owner",
      ...overrides,
    }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    setCookie: response.headers.get("set-cookie"),
  };
}

describe("platform registration durable transaction", () => {
  it("sets cookies only after the complete account batch commits", async () => {
    await withServer(async (baseUrl, { storage, users, auth }) => {
      const result = await register(baseUrl);

      expect(result.status).toBe(200);
      expect(result.setCookie).toContain("roblox_ai_token=");
      expect(result.setCookie).toContain("roblox_ai_refresh=");
      const user = (result.body.data as { user: { id: string; email: string } })
        .user;
      expect(users.getById(user.id)?.email).toBe("owner@example.test");
      const token = /roblox_ai_token=([^;]+)/.exec(result.setCookie!)?.[1];
      expect(token).toBeTruthy();
      expect(auth.validateToken(token!)).toMatchObject({ userId: user.id });
      expect(storage.count("auth_credentials")).toBe(1);
      expect(storage.count("auth_refresh_credentials")).toBe(1);
    });
  });

  it("returns 503 without cookies or orphan records after durable rejection", async () => {
    await withServer(async (baseUrl, { storage }) => {
      storage.rejectBatch = true;
      const result = await register(baseUrl);

      expect(result).toMatchObject({
        status: 503,
        body: {
          success: false,
          error: "Durable storage is temporarily unavailable",
        },
      });
      expect(result.setCookie).toBeNull();
      expect(storage.count("users")).toBe(0);
      expect(storage.count("auth_credentials")).toBe(0);
      expect(storage.count("auth_roles")).toBe(0);
      expect(storage.count("auth_sessions")).toBe(0);
      expect(storage.count("auth_refresh_credentials")).toBe(0);
    });
  });

  it("returns 409 without creating a second user or session", async () => {
    await withServer(async (baseUrl, { storage }) => {
      const first = await register(baseUrl);
      expect(first.status).toBe(200);

      const duplicate = await register(baseUrl, {
        email: " OWNER@example.test ",
        displayName: "Duplicate",
      });

      expect(duplicate).toMatchObject({
        status: 409,
        body: { success: false, error: "Email already registered" },
      });
      expect(duplicate.setCookie).toBeNull();
      expect(storage.count("users")).toBe(1);
      expect(storage.count("auth_credentials")).toBe(1);
      expect(storage.count("auth_roles")).toBe(1);
      expect(storage.count("auth_sessions")).toBe(1);
      expect(storage.count("auth_refresh_credentials")).toBe(1);
    });
  });
});
