/**
 * StudioSession — Session management for Studio Bridge connections.
 */

import { randomUUID } from "crypto";
import type { StudioClient } from "./StudioTypes";

export interface BridgeSession {
  sessionId: string;
  clientId: string;
  projectId?: string;
  studioVersion: string;
  createdAt: number;
  lastActivity: number;
  status: "active" | "expired" | "closed";
}

const SESSION_TIMEOUT_MS = 60_000; // 60 seconds without heartbeat → expired

export class StudioSessionManager {
  private sessions: Map<string, BridgeSession> = new Map();
  private clientToSession: Map<string, string> = new Map();

  /**
   * Create a session for a connected client.
   */
  create(client: StudioClient): BridgeSession {
    const session: BridgeSession = {
      sessionId: `session-${randomUUID().slice(0, 10)}`,
      clientId: client.clientId,
      projectId: client.projectId,
      studioVersion: client.studioVersion,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: "active",
    };
    this.sessions.set(session.sessionId, session);
    this.clientToSession.set(client.clientId, session.sessionId);
    return session;
  }

  /**
   * Close a session.
   */
  close(clientId: string): boolean {
    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) return false;
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "closed";
    }
    this.clientToSession.delete(clientId);
    return true;
  }

  /**
   * Record activity (heartbeat).
   */
  recordActivity(clientId: string): boolean {
    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) return false;
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return false;
    session.lastActivity = Date.now();
    return true;
  }

  /**
   * Get active session for a client.
   */
  getByClient(clientId: string): BridgeSession | null {
    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Check for expired sessions and mark them.
   */
  checkTimeouts(): string[] {
    const now = Date.now();
    const expired: string[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (
        session.status === "active" &&
        now - session.lastActivity > SESSION_TIMEOUT_MS
      ) {
        session.status = "expired";
        expired.push(sessionId);
      }
    }
    return expired;
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): BridgeSession[] {
    return [...this.sessions.values()].filter((s) => s.status === "active");
  }

  get count(): number {
    return this.sessions.size;
  }
}
