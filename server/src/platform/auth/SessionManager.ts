/**
 * SessionManager — Manages active user sessions independently of token format.
 */

import { randomUUID } from "crypto";

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  active: boolean;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  create(userId: string): Session {
    const session: Session = {
      id: `sess-${randomUUID().slice(0, 12)}`,
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      lastActivity: Date.now(),
      active: true,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  validate(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (!session.active) return null;
    if (Date.now() > session.expiresAt) {
      session.active = false;
      return null;
    }
    session.lastActivity = Date.now();
    return session;
  }

  invalidate(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.active = false;
    return true;
  }

  invalidateAllForUser(userId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.active) {
        session.active = false;
        count++;
      }
    }
    return count;
  }

  getActiveSessions(userId: string): Session[] {
    return [...this.sessions.values()].filter(
      (s) => s.userId === userId && s.active && Date.now() < s.expiresAt,
    );
  }

  count(): number {
    return [...this.sessions.values()].filter((s) => s.active).length;
  }
}
