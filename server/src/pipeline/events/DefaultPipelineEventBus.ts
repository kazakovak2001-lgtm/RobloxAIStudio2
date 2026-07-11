/**
 * DefaultPipelineEventBus — In-memory event dispatcher with multiple subscribers.
 * Extension point for future RabbitMQ/Kafka/event streaming integration.
 */

import type { PipelineEvent } from "./PipelineEvent";
import type {
  PipelineEventBus,
  PipelineEventHandler,
} from "./PipelineEventBus";

export class DefaultPipelineEventBus implements PipelineEventBus {
  private handlers: PipelineEventHandler[] = [];
  private history: PipelineEvent[] = [];
  private maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  emit(event: PipelineEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-Math.round(this.maxHistory * 0.75));
    }
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        /* non-blocking: subscriber errors must not break the bus */
      }
    }
  }

  subscribe(handler: PipelineEventHandler): void {
    this.handlers.push(handler);
  }

  unsubscribe(handler: PipelineEventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  getHistory(pipelineId?: string): PipelineEvent[] {
    if (pipelineId) {
      return this.history.filter((e) => e.pipelineId === pipelineId);
    }
    return [...this.history];
  }

  get subscriberCount(): number {
    return this.handlers.length;
  }

  get historyCount(): number {
    return this.history.length;
  }
}
