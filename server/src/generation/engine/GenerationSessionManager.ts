/**
 * GenerationSessionManager.ts
 *
 * Manages active and completed generation sessions.
 */

import { randomUUID } from "crypto";

export interface EngineSession {
  sessionId: string;
  modelId: string;
  status: "active" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  generatorsExecuted: string[];
  errors: string[];
}

export class GenerationSessionManager {
  private sessions: Map<string, EngineSession> = new Map();
  private maxSessions = 100;

  /**
   * Create a new session.
   */
  create(modelId: string): EngineSession {
    const session: EngineSession = {
      sessionId: `eng-session-${randomUUID().slice(0, 8)}`,
      modelId,
      status: "active",
      startedAt: Date.now(),
      generatorsExecuted: [],
      errors: [],
    };
    this.evictIfNeeded();
    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Record a generator execution.
   */
  recordGenerator(sessionId: string, generatorId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.generatorsExecuted.push(generatorId);
  }

  /**
   * Record an error.
   */
  recordError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.errors.push(error);
  }

  /**
   * Complete a session.
   */
  complete(sessionId: string, success: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = success ? "completed" : "failed";
      session.completedAt = Date.now();
    }
  }

  /**
   * Get a session.
   */
  get(sessionId: string): EngineSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * List all sessions.
   */
  list(): EngineSession[] {
    return [...this.sessions.values()];
  }

  get size(): number {
    return this.sessions.size;
  }

  private evictIfNeeded(): void {
    if (this.sessions.size < this.maxSessions) return;
    const oldest = [...this.sessions.entries()].sort(
      (a, b) => a[1].startedAt - b[1].startedAt,
    )[0];
    if (oldest) this.sessions.delete(oldest[0]);
  }
}
