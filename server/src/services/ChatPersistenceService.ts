/**
 * Conversation storage used by the platform API.
 *
 * The current GitHub branch keeps projects and users in process memory, so chat
 * uses the same persistence boundary. Keeping the service behind this class
 * lets the existing Prisma adapter replace it without changing the route or
 * frontend contracts.
 */

import { randomUUID } from "crypto";

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

const conversations = new Map<string, Conversation>();
const messages = new Map<string, ConversationMessage[]>();

export class ChatPersistenceService {
  getHistory(projectId: string, limit = 50): Conversation[] {
    this.requireText(projectId, "projectId");
    return [...conversations.values()]
      .filter((conversation) => conversation.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  getConversation(id: string): ConversationWithMessages | null {
    this.requireText(id, "id");
    const conversation = conversations.get(id);
    if (!conversation) return null;
    return {
      ...conversation,
      messages: [...(messages.get(id) ?? [])].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      ),
    };
  }

  createMessage(input: CreateMessageInput): ConversationMessage {
    const content = this.requireText(input.content, "content");
    if (!["user", "assistant", "system"].includes(input.role)) {
      throw new ChatValidationError("role must be user, assistant, or system");
    }

    let conversationId = input.conversationId;
    if (!conversationId) {
      const projectId = this.requireText(input.projectId, "projectId");
      const now = new Date().toISOString();
      conversationId = `conversation-${randomUUID()}`;
      conversations.set(conversationId, {
        id: conversationId,
        projectId,
        title: content.slice(0, 80),
        createdAt: now,
        updatedAt: now,
      });
      messages.set(conversationId, []);
    }

    const conversation = conversations.get(conversationId);
    if (!conversation) {
      throw new ChatValidationError("conversationId does not exist");
    }

    const message: ConversationMessage = {
      id: `message-${randomUUID()}`,
      conversationId,
      role: input.role,
      content,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
    messages.set(conversationId, [
      ...(messages.get(conversationId) ?? []),
      message,
    ]);
    conversations.set(conversationId, {
      ...conversation,
      updatedAt: message.createdAt,
    });
    return message;
  }

  deleteConversation(id: string): boolean {
    this.requireText(id, "id");
    messages.delete(id);
    return conversations.delete(id);
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
