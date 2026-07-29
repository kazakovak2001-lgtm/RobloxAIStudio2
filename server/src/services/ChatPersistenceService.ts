import { randomUUID } from "crypto";
import { getConfiguredStorageProvider } from "../platform/storage/StorageFactory";
import {
  InMemoryStorageProvider,
  type DurableMutation,
  type StorageProvider,
} from "../platform/storage/StorageProvider";

export type ConversationRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Conversation {
  id: string;
  projectId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

export interface CreateMessageInput {
  conversationId?: string;
  projectId?: string;
  role: ConversationRole;
  content: string;
  metadata?: Record<string, unknown>;
}

const CONVERSATIONS = "chat_conversations";
const MESSAGES = "chat_messages";

interface PreparedMessageMutation {
  conversation: Conversation;
  message: ConversationMessage;
}

/**
 * Project chat persistence over the same process-wide StorageProvider used by
 * identity and projects. The optional in-memory default preserves isolated
 * unit-test construction; production bootstrap resolves the configured provider.
 */
export class ChatPersistenceService {
  constructor(
    private readonly storage: StorageProvider = getConfiguredStorageProvider() ??
      new InMemoryStorageProvider(),
  ) {}

  getHistory(projectId: string, limit = 50): Conversation[] {
    this.requireText(projectId, "projectId");
    return this.storage
      .list<Conversation>(
        CONVERSATIONS,
        (conversation) => conversation.projectId === projectId,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  getConversation(id: string): ConversationWithMessages | null {
    this.requireText(id, "id");
    const conversation = this.storage.get<Conversation>(CONVERSATIONS, id);
    if (!conversation) return null;
    return {
      ...conversation,
      messages: this.storage
        .list<ConversationMessage>(
          MESSAGES,
          (message) => message.conversationId === id,
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    };
  }

  createMessage(input: CreateMessageInput): ConversationMessage {
    const prepared = this.prepareMessageMutation(input);
    this.storage.set(CONVERSATIONS, prepared.conversation.id, prepared.conversation);
    this.storage.set(MESSAGES, prepared.message.id, prepared.message);
    return prepared.message;
  }

  async createMessageDurable(
    input: CreateMessageInput,
  ): Promise<ConversationMessage> {
    const prepared = this.prepareMessageMutation(input);
    await this.storage.mutateDurably([
      {
        type: "set",
        collection: CONVERSATIONS,
        id: prepared.conversation.id,
        data: prepared.conversation,
      },
      {
        type: "set",
        collection: MESSAGES,
        id: prepared.message.id,
        data: prepared.message,
      },
    ]);
    return prepared.message;
  }

  deleteConversation(id: string): boolean {
    this.requireText(id, "id");
    for (const message of this.getConversationMessages(id)) {
      this.storage.delete(MESSAGES, message.id);
    }
    return this.storage.delete(CONVERSATIONS, id);
  }

  async deleteConversationDurable(id: string): Promise<boolean> {
    this.requireText(id, "id");
    if (!this.storage.get<Conversation>(CONVERSATIONS, id)) return false;

    const mutations: DurableMutation[] = this.getConversationMessages(id).map(
      (message) => ({
        type: "delete",
        collection: MESSAGES,
        id: message.id,
      }),
    );
    mutations.push({ type: "delete", collection: CONVERSATIONS, id });
    await this.storage.mutateDurably(mutations);
    return true;
  }

  private prepareMessageMutation(
    input: CreateMessageInput,
  ): PreparedMessageMutation {
    const content = this.requireText(input.content, "content");
    if (!["user", "assistant", "system"].includes(input.role)) {
      throw new ChatValidationError("role must be user, assistant, or system");
    }

    const createdAt = new Date().toISOString();
    let conversation: Conversation;
    if (input.conversationId) {
      const existing = this.storage.get<Conversation>(
        CONVERSATIONS,
        input.conversationId,
      );
      if (!existing) {
        throw new ChatValidationError("conversationId does not exist");
      }
      conversation = { ...existing, updatedAt: createdAt };
    } else {
      const projectId = this.requireText(input.projectId, "projectId");
      const conversationId = `conversation-${randomUUID()}`;
      conversation = {
        id: conversationId,
        projectId,
        title: content.slice(0, 80),
        createdAt,
        updatedAt: createdAt,
      };
    }

    const message: ConversationMessage = {
      id: `message-${randomUUID()}`,
      conversationId: conversation.id,
      role: input.role,
      content,
      metadata: input.metadata,
      createdAt,
    };

    return { conversation, message };
  }

  private getConversationMessages(id: string): ConversationMessage[] {
    return this.storage.list<ConversationMessage>(
      MESSAGES,
      (candidate) => candidate.conversationId === id,
    );
  }

  private requireText(value: unknown, field: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new ChatValidationError(`${field} is required`);
    }
    return value.trim();
  }
}

export class ChatValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatValidationError";
  }
}
