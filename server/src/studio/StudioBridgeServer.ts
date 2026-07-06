/**
 * StudioBridgeServer.ts
 *
 * Network bridge between Roblox Studio and compiler backend.
 * Uses WebSocket-compatible interface for bidirectional communication.
 * Session-based connections — one session per Studio instance.
 */

import type { StudioEvent, CompilerUpdate } from "./StudioTypes";

export type StudioEventHandler = (event: StudioEvent) => Promise<void> | void;

export interface StudioSession {
  sessionId: string;
  studioId: string;
  projectId?: string;
  connectedAt: Date;
  lastActivityAt: Date;
  status: "active" | "idle" | "disconnected";
}

export class StudioBridgeServer {
  private sessions = new Map<string, StudioSession>();
  private handlers: StudioEventHandler[] = [];
  private outboundQueue = new Map<string, CompilerUpdate[]>();

  /**
   * Register a handler for incoming Studio events.
   */
  onStudioEvent(handler: StudioEventHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Handle an incoming event from a Studio instance.
   */
  async handleStudioEvent(event: StudioEvent): Promise<void> {
    const session = this.sessions.get(event.studioId);
    if (session) {
      session.lastActivityAt = new Date();
    }

    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[BRIDGE] Handler error for event ${event.type}:`, err);
      }
    }

    console.log(
      `[BRIDGE] Event received | Studio: ${event.studioId} | Type: ${event.type}`,
    );
  }

  /**
   * Send a compiler update to a specific Studio instance.
   */
  sendUpdate(studioId: string, update: CompilerUpdate): void {
    const queue = this.outboundQueue.get(studioId) ?? [];
    queue.push(update);
    this.outboundQueue.set(studioId, queue);

    // In production, this would push via WebSocket/HTTP to the Studio plugin
    console.log(
      `[BRIDGE] Update queued | Studio: ${studioId} | Type: ${update.type}`,
    );
  }

  /**
   * Drain outbound queue for a Studio instance (called by polling or push).
   */
  drainQueue(studioId: string): CompilerUpdate[] {
    const queue = this.outboundQueue.get(studioId) ?? [];
    this.outboundQueue.set(studioId, []);
    return queue;
  }

  /**
   * Register a new Studio session.
   */
  connectSession(studioId: string, projectId?: string): StudioSession {
    const session: StudioSession = {
      sessionId: `session-${studioId}-${Date.now()}`,
      studioId,
      projectId,
      connectedAt: new Date(),
      lastActivityAt: new Date(),
      status: "active",
    };
    this.sessions.set(studioId, session);
    console.log(
      `[BRIDGE] Session connected | Studio: ${studioId} | Project: ${projectId ?? "none"}`,
    );
    return session;
  }

  /**
   * Disconnect a Studio session.
   */
  disconnectSession(studioId: string): void {
    const session = this.sessions.get(studioId);
    if (session) {
      session.status = "disconnected";
    }
    this.sessions.delete(studioId);
    this.outboundQueue.delete(studioId);
    console.log(`[BRIDGE] Session disconnected | Studio: ${studioId}`);
  }

  getSession(studioId: string): StudioSession | null {
    return this.sessions.get(studioId) ?? null;
  }

  getActiveSessions(): StudioSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === "active",
    );
  }

  get sessionCount(): number {
    return this.sessions.size;
  }
}
