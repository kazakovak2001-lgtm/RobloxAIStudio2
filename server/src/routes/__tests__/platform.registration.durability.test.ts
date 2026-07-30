import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { AuthService } from "../../platform/auth/AuthService";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../platform/storage/StorageProvider";
import type { ProjectAccessControl } from "../projects";
import { createPlatformRouter } from "../platform";

class ControlledRegistrationStorage extends InMemoryStorageProvider {
  rejectBatch = false;
  batchCalls = 0;

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    this.batchCalls += 1;
    if (this.rejectBatch) {
      throw new DurableStorageError(
        "Injected registration transaction rejection",
        "transaction",
      );
    }
    return super.applyDurableBatch(mutations);
  }
}

const access: ProjectAccessControl = {
  getRequestUserId: () => "request-user",
  requireAuthenticatedUser: () => "request-user",
  requireProjectAccess: () => true,
};

async function withServer<T>(
  storage: ControlledRegistrationStorage,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(
    "/platform",
    createPlatformRouter({
      storage,
      access,
      auth: new AuthService(storage),
    }),
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}/platform`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

interface RegistrationResponse {
  status: number;
  body: Record<string, unknown>;
  setCookie: string | null;
}

async function register(
  baseUrl: string,
  email: string,
): Promise<RegistrationResponse> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Atomic-Register-Password!",
      displayName: "Atomic Register",
    }),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    setCookie: response.headers.get("set-cookie"),
  };
}

function expectRegistrationCounts(
  storage: ControlledRegistrationStorage,
  expected: number,
): void {
  expect(storage.count("users")).toBe(expected);
  expect(storage.count("auth_credentials")).toBe(expected);
  expect(storage.count("auth_roles")).toBe(expected);
  expect(storage.count("auth_sessions")).toBe(expected);
  expect(storage.count("auth_refresh_credentials")).toBe(expected);
}

describe("platform atomic registration durability", () => {
  it("publishes all linked records together and returns credentials only as cookies", async () => {
    const storage = new ControlledRegistrationStorage();

    await withServer(storage, async (baseUrl) => {
      const result = await register(baseUrl, "atomic-register@example.com");

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(JSON.stringify(result.body)).not.toMatch(
        /(?:tok|ref)_[a-f0-9]{16,}/,
      );
      expect(result.setCookie).toContain("access_token=");
      expect(result.setCookie).toContain("refresh_token=");
      expectRegistrationCounts(storage, 1);
      expect(storage.batchCalls).toBe(1);
    });
  });

  it("returns 503, sets no cookies, and publishes nothing after transaction rejection", async () => {
    const storage = new ControlledRegistrationStorage();
    storage.rejectBatch = true;

    await withServer(storage, async (baseUrl) => {
      const result = await register(baseUrl, "rejected-register@example.com");

      expect(result).toMatchObject({
        status: 503,
        body: {
          success: false,
          error: "Durable storage is temporarily unavailable",
        },
      });
      expect(result.setCookie).toBeNull();
      expectRegistrationCounts(storage, 0);
      expect(storage.batchCalls).toBe(1);
    });
  });

  it("normalizes duplicate email and creates no second session or refresh index", async () => {
    const storage = new ControlledRegistrationStorage();

    await withServer(storage, async (baseUrl) => {
      const first = await register(baseUrl, "duplicate@example.com");
      const duplicate = await register(baseUrl, "  DUPLICATE@example.com  ");

      expect(first.status).toBe(200);
      expect(duplicate).toMatchObject({
        status: 409,
        body: {
          success: false,
          error: "Email already registered",
        },
      });
      expect(duplicate.setCookie).toBeNull();
      expectRegistrationCounts(storage, 1);
      expect(storage.batchCalls).toBe(1);
    });
  });
});
