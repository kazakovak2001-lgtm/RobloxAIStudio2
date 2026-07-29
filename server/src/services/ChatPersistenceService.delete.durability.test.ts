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
  type ConversationMessage,
} from "./ChatPersistenceService";

const CONVERSATIONS = "chat_conversations";
const MESSAGES = "chat_messages";

interface SeededConversation {
  conversation: Conversation;
  firstMessage: ConversationMessage;
  secondMessage: ConversationMessage;
  unrelatedMessage: ConversationMessage;
}

function seedConversation(
  storage: InMemoryStorageProvider,
): SeededConversation {
  const conversation: Conversation = {
    id: "conversation-delete",
    projectId: "project-1",
    title: "Delete me",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:02.000Z",
  };
  const firstMessage: ConversationMessage = {
    id: "message-delete-1",
    conversationId: conversation.id,
    role: "user",
    content: "First",
    createdAt: "2026-01-01T00:00:01.000Z",
  };
  const secondMessage: ConversationMessage = {
    id: "message-delete-2",
    conversationId: conversation.id,
    role: "assistant",
    content: "Second",
    createdAt: "2026-01-01T00:00:02.000Z",
  };
  const unrelatedMessage: ConversationMessage = {
    id: "message-other",
    conversationId: "conversation-other",
    role: "user",
    content: "Keep",
    createdAt: "2026-01-01T00:00:03.000Z",
  };

  storage.set(CONVERSATIONS, conversation.id, conversation);
  storage.set(MESSAGES, firstMessage.id, firstMessage);
  storage.set(MESSAGES, secondMessage.id, secondMessage);
  storage.set(MESSAGES, unrelatedMessage.id, unrelatedMessage);

  return { conversation, firstMessage, secondMessage, unrelatedMessage };
}

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
      "Injected conversation delete rejection",
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

describe("ChatPersistenceService durable conversation deletion", () => {
  it("deletes messages and the conversation in one root-last batch", async () => {
    const storage = new CapturingBatchStorage();
    const records = seedConversation(storage);
    const service = new ChatPersistenceService(storage);

    await expect(
      service.deleteConversation(records.conversation.id),
    ).resolves.toBe(true);

    expect(storage.batchCalls).toBe(1);
    expect(
      storage.received.map((mutation) => [mutation.collection, mutation.id]),
    ).toEqual([
      [MESSAGES, records.firstMessage.id],
      [MESSAGES, records.secondMessage.id],
      [CONVERSATIONS, records.conversation.id],
    ]);
    expect(storage.get(CONVERSATIONS, records.conversation.id)).toBeNull();
    expect(storage.get(MESSAGES, records.firstMessage.id)).toBeNull();
    expect(storage.get(MESSAGES, records.secondMessage.id)).toBeNull();
    expect(storage.get(MESSAGES, records.unrelatedMessage.id)).toBe(
      records.unrelatedMessage,
    );
  });

  it("does not open a batch for a missing conversation", async () => {
    const storage = new CapturingBatchStorage();
    const service = new ChatPersistenceService(storage);

    await expect(service.deleteConversation("missing")).resolves.toBe(false);
    expect(storage.batchCalls).toBe(0);
  });

  it("keeps the complete conversation visible until acknowledgement", async () => {
    const storage = new DeferredBatchStorage();
    const records = seedConversation(storage);
    const service = new ChatPersistenceService(storage);

    const deletion = service.deleteConversation(records.conversation.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(storage.get(CONVERSATIONS, records.conversation.id)).toBe(
      records.conversation,
    );
    expect(storage.get(MESSAGES, records.firstMessage.id)).toBe(
      records.firstMessage,
    );
    expect(storage.get(MESSAGES, records.secondMessage.id)).toBe(
      records.secondMessage,
    );

    storage.release();
    await expect(deletion).resolves.toBe(true);
    expect(storage.get(CONVERSATIONS, records.conversation.id)).toBeNull();
  });

  it("preserves exact records and returns HTTP 503 when deletion rejects", async () => {
    const storage = new RejectingBatchStorage();
    const records = seedConversation(storage);
    const service = new ChatPersistenceService(storage);

    await withServer(service, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/conversation/${records.conversation.id}`,
        { method: "DELETE" },
      );
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

    expect(storage.get(CONVERSATIONS, records.conversation.id)).toBe(
      records.conversation,
    );
    expect(storage.get(MESSAGES, records.firstMessage.id)).toBe(
      records.firstMessage,
    );
    expect(storage.get(MESSAGES, records.secondMessage.id)).toBe(
      records.secondMessage,
    );
  });
});
