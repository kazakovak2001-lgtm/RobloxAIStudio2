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
import type { ConcealingProjectAccess } from "../routes/projects";
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
      "Injected chat transaction rejection",
      "transaction",
    );
  }
}

// The conversation routes conceal resource existence, which they can only do
// through the bare-boolean check, so the stub has to provide it too.
const allowAccess = {
  getRequestUserId: (_req: Request) => "owner",
  requireAuthenticatedUser: (_req: Request, _res: Response) => "owner",
  requireProjectAccess: (_req: Request, _res: Response, _projectId: string) =>
    true,
  hasProjectAccess: (_req: Request, _projectId: string) => true,
} as unknown as ConcealingProjectAccess;

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

  it("serializes deletion after an in-flight message batch", async () => {
    const storage = new DeferredBatchStorage();
    const conversation: Conversation = {
      id: "conversation-1",
      projectId: "project-1",
      title: "Existing",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    storage.set(CONVERSATIONS, conversation.id, conversation);
    const service = new ChatPersistenceService(storage);

    const creation = service.createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: "Concurrent response",
    });
    await Promise.resolve();
    await Promise.resolve();

    const deletion = service.deleteConversation(conversation.id);
    await Promise.resolve();
    expect(service.getConversation(conversation.id)).toEqual(
      expect.objectContaining({ id: conversation.id, messages: [] }),
    );

    storage.release();
    const [message, deleted] = await Promise.all([creation, deletion]);

    expect(deleted).toBe(true);
    expect(service.getConversation(conversation.id)).toBeNull();
    expect(storage.get(MESSAGES, message.id)).toBeNull();
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
