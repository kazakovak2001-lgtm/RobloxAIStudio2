/**
 * AgentMessageBus — Inter-agent communication system.
 */

import type { AgentMessage, MessageType } from "./CollaborationTypes";
import { createMessageId } from "./CollaborationTypes";

export class AgentMessageBus {
  private messages: AgentMessage[] = [];
  private handlers: Map<string, Array<(msg: AgentMessage) => void>> = new Map();

  send(
    from: string,
    to: string | "all",
    type: MessageType,
    subject: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): AgentMessage {
    const msg: AgentMessage = {
      id: createMessageId(),
      from,
      to,
      type,
      subject,
      content,
      metadata,
      timestamp: Date.now(),
      resolved: false,
    };
    this.messages.push(msg);
    this.notify(msg);
    return msg;
  }

  subscribe(agentId: string, handler: (msg: AgentMessage) => void): void {
    const list = this.handlers.get(agentId) ?? [];
    list.push(handler);
    this.handlers.set(agentId, list);
  }

  getMessages(agentId?: string): AgentMessage[] {
    if (!agentId) return [...this.messages];
    return this.messages.filter(
      (m) => m.to === agentId || m.to === "all" || m.from === agentId,
    );
  }

  getUnresolved(): AgentMessage[] {
    return this.messages.filter((m) => !m.resolved);
  }

  resolve(messageId: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (msg) msg.resolved = true;
  }

  get count(): number {
    return this.messages.length;
  }

  private notify(msg: AgentMessage): void {
    // Notify target
    if (msg.to !== "all") {
      const handlers = this.handlers.get(msg.to) ?? [];
      for (const h of handlers) {
        try {
          h(msg);
        } catch {
          /* non-blocking */
        }
      }
    } else {
      // Broadcast
      for (const [, handlers] of this.handlers) {
        for (const h of handlers) {
          try {
            h(msg);
          } catch {
            /* non-blocking */
          }
        }
      }
    }
  }
}
