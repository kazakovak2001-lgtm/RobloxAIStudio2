/**
 * AgentMessageBus.ts — Internal message bus for inter-agent communication.
 */

import type { AgentMessage, AgentMessageType } from "./types";
import { createMessageId } from "./types";

export type MessageHandler = (msg: AgentMessage) => void;

export class AgentMessageBus {
  private handlers: Map<string, MessageHandler[]> = new Map();
  private history: AgentMessage[] = [];
  private maxHistory = 500;

  send(
    from: string,
    to: string,
    type: AgentMessageType,
    payload: unknown,
  ): AgentMessage {
    const msg: AgentMessage = {
      id: createMessageId(),
      type,
      from,
      to,
      payload,
      timestamp: Date.now(),
    };
    this.history.push(msg);
    if (this.history.length > this.maxHistory) this.history.shift();
    const handlers = this.handlers.get(to) ?? [];
    for (const h of handlers) {
      try {
        h(msg);
      } catch {
        /* non-blocking */
      }
    }
    return msg;
  }

  subscribe(agentId: string, handler: MessageHandler): void {
    if (!this.handlers.has(agentId)) this.handlers.set(agentId, []);
    this.handlers.get(agentId)!.push(handler);
  }

  getHistory(agentId?: string): AgentMessage[] {
    if (!agentId) return [...this.history];
    return this.history.filter((m) => m.from === agentId || m.to === agentId);
  }

  get totalMessages(): number {
    return this.history.length;
  }
  clear(): void {
    this.history = [];
    this.handlers.clear();
  }
}
