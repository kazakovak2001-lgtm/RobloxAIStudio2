import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type Request, type Response } from "express";
import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../platform/storage/StorageProvider";
import { createChatPersistenceRouter } from "../routes/chatPersistence";
import type { ProjectAccessControl } from "../routes/projects";
import {
  ChatPersistenceService,
  type Conversation,
} from "./ChatPersistenceService";

const CONVERSATIONS = "chat_conversations";
const MESSAGES = "chat_messages";

class CapturingBatchStorage extends InMemoryStorageProvider {
  batchCalls = 0;
  received: readonly DurableMutation[] = [];

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    this.batchCalls += 1;
    this.received = mutations;
    return super.applyDurableBatch(mutations);
  }
}

class DeferredBatchStorage extends InMemoryStorageProvider {
  received: readonly DurableMutation[] = [];
  private acknowledge!: () => void;
  private readonly acknowledged = new Promise<void>((resolve) => {
    this.acknowledge = resolve;
  });

  release(): void {
    this.acknowledge();
  }

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    this.received = mutations;
    await this.acknowledged;
    return super.applyDurableBatch(mutations);
  }
}

class RejectingBatchStorage extends InMemoryStorageProvider {
  override async applyDurableBatch(
    _mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    throw new DurableStorageError(
      "Injected chat message transaction rejection",
      "transaction",
    );
  }
}

const allowAccess: ProjectAccessControl = {
  getRequestUserId: (_req: Request) => "owner",
  requireAuthenticatedUser: (_req: Request, _res: Response) => "owner",
  requireProjectAccess: (_req: Request, _res: Response, _projectId: string) =>
    true,
};

async function withServer<T>(
  service: ChatPersistenceService,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/chat", createChatPersistenceRouter(allowAccess, service));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}/chat`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("ChatPersistenceService durable message creation", () => {
  it("creates the message and conversation in one durable batch", async () => {
    const storage = new CapturingBatchStorage();
    const service = new ChatPersistenceService(storage);

    const message = await service.createMessage({
      projectId: "project-1",
      role: "user",
      content: "Build a cooperative obby",
    });

    expect(storage.batchCalls).toBe(1);
    expect(storage.received.map((mutation) => mutation.collection)).toEqual([
      MESSAGES,
      CONVERSATIONS,
    ]);
    expect(service.getConversation(message.conversationId)).toEqual(
      expect.objectContaining({
        id: message.conversationId,
        projectId: "project-1",
        messages: [message],
      }),
    );
  });

  it("publishes neither record before the batch is acknowledged", async () => {
    const storage = new DeferredBatchStorage();
    const service = new ChatPersistenceService(storage);

    const creation = service.createMessage({
      projectId: "project-1",
      role: "assistant",
      content: "Pending response",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(storage.count(CONVERSATIONS)).toBe(0);
    expect(storage.count(MESSAGES)).toBe(0);
    expect(storage.received).toHaveLength(2);

    storage.release();
    const message = await creation;
    expect(service.getConversation(message.conversationId)?.messages).toEqual([
      message,
    ]);
  });

  it("preserves the exact conversation when the batch rejects", async () => {
    const storage = new RejectingBatchStorage();
    const previous: Conversation = {
      id: "conversation-1",
      projectId: "project-1",
      title: "Existing",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    storage.set(CONVERSATIONS, previous.id, previous);
    const service = new ChatPersistenceService(storage);

    await expect(
      service.createMessage({
        conversationId: previous.id,
        role: "user",
        content: "Rejected message",
      }),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.get(CONVERSATIONS, previous.id)).toBe(previous);
    expect(storage.count(MESSAGES)).toBe(0);
  });

  it("returns HTTP 503 without exposing the storage error", async () => {
    const service = new ChatPersistenceService(new RejectingBatchStorage());

    await withServer(service, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project-1",
          role: "user",
          content: "Rejected route message",
        }),
      });
      const body = (await response.json()) as {
        success: boolean;
        error: string;
      };

      expect(response.status).toBe(503);
      expect(body).toEqual({
        success: false,
        error: "Chat persistence temporarily unavailable",
      });
      expect(body.error).not.toContain("Injected");
    });
  });
});
