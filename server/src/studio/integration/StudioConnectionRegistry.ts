/**
 * StudioConnectionRegistry.ts
 *
 * Manages connected Studio instances with heartbeat tracking.
 * Extends the existing StudioBridgeServer session model.
 */

import type { StudioProjectSession } from "./types";

export class StudioConnectionRegistry {
  private connections: Map<string, StudioProjectSession> = new Map();
  private heartbeats: Map<string, number> = new Map();
  private heartbeatTimeoutMs = 30000;

  connect(studioId: string, projectId: string): StudioProjectSession {
    const session: StudioProjectSession = {
      sessionId: `studio-session-${studioId}-${Date.now()}`,
      studioId,
      projectId,
      status: "idle",
      connectedAt: Date.now(),
      syncCount: 0,
      version: 0,
    };
    this.connections.set(studioId, session);
    this.heartbeats.set(studioId, Date.now());
    return session;
  }

  disconnect(studioId: string): void {
    this.connections.delete(studioId);
    this.heartbeats.delete(studioId);
  }

  heartbeat(studioId: string): boolean {
    if (!this.connections.has(studioId)) return false;
    this.heartbeats.set(studioId, Date.now());
    return true;
  }

  isAlive(studioId: string): boolean {
    const last = this.heartbeats.get(studioId);
    if (!last) return false;
    return Date.now() - last < this.heartbeatTimeoutMs;
  }

  getSession(studioId: string): StudioProjectSession | null {
    return this.connections.get(studioId) ?? null;
  }

  getActiveSessions(): StudioProjectSession[] {
    return [...this.connections.values()].filter((s) =>
      this.isAlive(s.studioId),
    );
  }

  getStaleConnections(): string[] {
    const stale: string[] = [];
    for (const [id] of this.connections) {
      if (!this.isAlive(id)) stale.push(id);
    }
    return stale;
  }

  updateSessionStatus(
    studioId: string,
    status: StudioProjectSession["status"],
  ): void {
    const session = this.connections.get(studioId);
    if (session) session.status = status;
  }

  get size(): number {
    return this.connections.size;
  }
}
