import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type Request, type Response } from "express";
import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../platform/storage/StorageProvider";
import { ChatPersistenceService } from "../../services/ChatPersistenceService";
import { createChatPersistenceRouter } from "../chatPersistence";
import type { ProjectAccessControl } from "../projects";

class ControlledBatchStorage extends InMemoryStorageProvider {
  rejectBatch = false;
  batchCalls = 0;

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    this.batchCalls += 1;
    if (this.rejectBatch) {
      throw new DurableStorageError("injected batch rejection", "transaction");
    }
    return super.applyDurableBatch(mutations);
  }
}

function access(allowed = true): ProjectAccessControl {
  return {
    getRequestUserId: () => "user-1",
    requireAuthenticatedUser: () => "user-1",
    requireProjectAccess: (_req: Request, res: Response) => {
      if (allowed) return true;
      res.status(403).json({ success: false, error: "Access denied" });
      return false;
    },
  };
}

async function withServer<T>(
  storage: ControlledBatchStorage,
  callback: (baseUrl: string, service: ChatPersistenceService) => Promise<T>,
  allowed = true,
): Promise<T> {
  const service = new ChatPersistenceService(storage);
  const app = express();
  app.use(express.json());
  app.use("/chat", createChatPersistenceRouter(access(allowed), service));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}/chat`, service);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function requestJson(
  url: string,
  method: "POST" | "DELETE",
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("chat persistence durable transaction boundary", () => {
  it("returns 503 and exposes no partial conversation on rejected create", async () => {
    const storage = new ControlledBatchStorage();
    storage.rejectBatch = true;

    await withServer(storage, async (baseUrl, service) => {
      const result = await requestJson(`${baseUrl}/message`, "POST", {
        projectId: "project-1",
        role: "user",
        content: "Uncommitted message",
      });

      expect(result).toMatchObject({
        status: 503,
        body: {
          success: false,
          error: "Durable storage is temporarily unavailable",
        },
      });
      expect(service.getHistory("project-1")).toEqual([]);
      expect(storage.count("chat_messages")).toBe(0);
    });
  });

  it("preserves the complete conversation when message append is rejected", async () => {
    const storage = new ControlledBatchStorage();

    await withServer(storage, async (baseUrl, service) => {
      const first = await service.createMessage({
        projectId: "project-1",
        role: "user",
        content: "Committed first message",
      });
      const before = service.getConversation(first.conversationId);
      storage.rejectBatch = true;

      const result = await requestJson(`${baseUrl}/message`, "POST", {
        conversationId: first.conversationId,
        role: "assistant",
        content: "Rejected reply",
      });

      expect(result.status).toBe(503);
      expect(service.getConversation(first.conversationId)).toEqual(before);
    });
  });

  it("preserves conversation and messages when delete is rejected", async () => {
    const storage = new ControlledBatchStorage();

    await withServer(storage, async (baseUrl, service) => {
      const first = await service.createMessage({
        projectId: "project-1",
        role: "user",
        content: "Keep this conversation",
      });
      await service.createMessage({
        conversationId: first.conversationId,
        role: "assistant",
        content: "Keep this reply",
      });
      const before = service.getConversation(first.conversationId);
      storage.rejectBatch = true;

      const result = await requestJson(
        `${baseUrl}/conversation/${first.conversationId}`,
        "DELETE",
      );

      expect(result.status).toBe(503);
      expect(service.getConversation(first.conversationId)).toEqual(before);
    });
  });

  it("publishes acknowledged create and delete batches immediately", async () => {
    const storage = new ControlledBatchStorage();

    await withServer(storage, async (baseUrl, service) => {
      const created = await requestJson(`${baseUrl}/message`, "POST", {
        projectId: "project-1",
        role: "user",
        content: "Committed message",
      });

      expect(created.status).toBe(201);
      const message = created.body.data as { conversationId: string };
      expect(
        service.getConversation(message.conversationId)?.messages,
      ).toHaveLength(1);

      const deleted = await requestJson(
        `${baseUrl}/conversation/${message.conversationId}`,
        "DELETE",
      );
      expect(deleted).toMatchObject({
        status: 200,
        body: { success: true, data: { deleted: true } },
      });
      expect(service.getConversation(message.conversationId)).toBeNull();
      expect(storage.batchCalls).toBe(2);
    });
  });

  it("rejects unauthorized mutation before opening a durable batch", async () => {
    const storage = new ControlledBatchStorage();

    await withServer(
      storage,
      async (baseUrl, service) => {
        const result = await requestJson(`${baseUrl}/message`, "POST", {
          projectId: "project-1",
          role: "user",
          content: "Forbidden message",
        });

        expect(result.status).toBe(403);
        expect(storage.batchCalls).toBe(0);
        expect(service.getHistory("project-1")).toEqual([]);
      },
      false,
    );
  });
});
