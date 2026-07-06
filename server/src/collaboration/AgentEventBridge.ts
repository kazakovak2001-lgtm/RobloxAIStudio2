/**
 * AgentEventBridge.ts
 *
 * Connects AI agents to the EventStore stream.
 * Agents subscribe to relevant events and emit decisions.
 * Ensures deterministic ordering and prevents feedback loops.
 */

import {
  EventStore,
  getEventStore,
  type SystemEvent,
} from "../eventsource/EventStore";
import type { AgentDecision } from "./CollaborationTypes";

export type AgentEventHandler = (event: SystemEvent) => Promise<void> | void;

interface AgentSubscription {
  agentId: string;
  eventTypes: string[];
  handler: AgentEventHandler;
}

export class AgentEventBridge {
  private eventStore: EventStore;
  private subscriptions: AgentSubscription[] = [];
  /** Track which events were agent-generated to prevent loops */
  private agentGeneratedEvents = new Set<string>();
  private lastProcessedOffset = 0;

  constructor(eventStore?: EventStore) {
    this.eventStore = eventStore ?? getEventStore();
  }

  /**
   * Subscribe an agent to specific event types.
   */
  subscribe(
    agentId: string,
    eventTypes: string[],
    handler: AgentEventHandler,
  ): void {
    this.subscriptions.push({ agentId, eventTypes, handler });
    console.log(
      `[EVENT-BRIDGE] Subscribed | Agent: ${agentId} | Events: ${eventTypes.join(", ")}`,
    );
  }

  /**
   * Unsubscribe an agent.
   */
  unsubscribe(agentId: string): void {
    this.subscriptions = this.subscriptions.filter(
      (s) => s.agentId !== agentId,
    );
  }

  /**
   * Emit an agent decision into the EventStore.
   * Marks it as agent-generated to prevent feedback loops.
   */
  emitDecision(agentId: string, decision: AgentDecision): void {
    const event = this.eventStore.append({
      type: "agent.decision.made",
      timestamp: new Date(),
      projectId: undefined,
      payload: decision,
      metadata: { workerId: agentId },
    });
    this.agentGeneratedEvents.add(event.eventId);

    console.log(
      `[EVENT-BRIDGE] Decision emitted | Agent: ${agentId} | Category: ${decision.category} | Confidence: ${decision.confidence}`,
    );
  }

  /**
   * Route new events to subscribed agents.
   * Skips agent-generated events to prevent feedback loops.
   * Call periodically or on new event arrival.
   */
  async routeEvents(): Promise<number> {
    const events = this.eventStore.read(this.lastProcessedOffset);
    let routed = 0;

    for (const event of events) {
      // Skip agent-generated events (prevent feedback)
      if (this.agentGeneratedEvents.has(event.eventId)) continue;

      for (const sub of this.subscriptions) {
        if (
          sub.eventTypes.includes(event.type) ||
          sub.eventTypes.includes("*")
        ) {
          try {
            await sub.handler(event);
            routed++;
          } catch (err) {
            console.error(
              `[EVENT-BRIDGE] Handler error | Agent: ${sub.agentId}:`,
              err,
            );
          }
        }
      }

      this.lastProcessedOffset = event.offset;
    }

    return routed;
  }

  /**
   * Get subscription count.
   */
  get subscriptionCount(): number {
    return this.subscriptions.length;
  }
}
