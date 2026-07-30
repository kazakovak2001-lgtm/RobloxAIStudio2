import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { UserRepository } from "../../platform/users";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../platform/storage/StorageProvider";
import type { ProjectAccessControl } from "../projects";
import { createPlatformRouter } from "../platform";

class ControlledMutationStorage extends InMemoryStorageProvider {
  rejectSet = false;

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    if (this.rejectSet) {
      throw new DurableStorageError("injected set rejection", "transaction");
    }
    return super.applyDurableBatch(mutations);
  }

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    if (this.rejectSet) {
      throw new DurableStorageError("injected set rejection", "set");
    }
    return super.setDurable(collection, id, data);
  }
}

function access(userId: string): ProjectAccessControl {
  return {
    getRequestUserId: () => userId,
    requireAuthenticatedUser: () => userId,
    requireProjectAccess: () => true,
  };
}

async function withServer<T>(
  storage: ControlledMutationStorage,
  userId: string,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(
    "/platform",
    createPlatformRouter({ storage, access: access(userId) }),
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

async function mutation(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("platform user durable HTTP acknowledgement", () => {
  it("returns 503 and exposes no user when create persistence is rejected", async () => {
    const storage = new ControlledMutationStorage();
    storage.rejectSet = true;

    await withServer(storage, "owner", async (baseUrl) => {
      const result = await mutation(`${baseUrl}/users`, "POST", {
        email: "rejected@example.com",
        displayName: "Rejected",
      });

      expect(result).toMatchObject({
        status: 503,
        body: {
          success: false,
          error: "Durable storage is temporarily unavailable",
        },
      });
      expect(storage.count("users")).toBe(0);
    });
  });

  it("makes an acknowledged user create immediately readable", async () => {
    const storage = new ControlledMutationStorage();

    await withServer(storage, "owner", async (baseUrl) => {
      const result = await mutation(`${baseUrl}/users`, "POST", {
        email: "committed@example.com",
        displayName: "Committed",
      });

      expect(result.status).toBe(200);
      const user = result.body.data as { id: string; email: string };
      expect(storage.get("users", user.id)).toMatchObject({
        id: user.id,
        email: "committed@example.com",
      });
    });
  });

  it("returns 503 and retains the exact previous user after update rejection", async () => {
    const storage = new ControlledMutationStorage();
    const users = new UserRepository(storage);
    const user = await users.createDurable({
      email: "before@example.com",
      displayName: "Before",
    });
    storage.rejectSet = true;

    await withServer(storage, user.id, async (baseUrl) => {
      const result = await mutation(`${baseUrl}/users/${user.id}`, "PATCH", {
        email: "after@example.com",
        displayName: "After",
      });

      expect(result).toMatchObject({
        status: 503,
        body: {
          success: false,
          error: "Durable storage is temporarily unavailable",
        },
      });
      expect(users.getById(user.id)).toEqual(user);
    });
  });
});