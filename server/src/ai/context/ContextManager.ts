/**
 * ContextManager — Creates and manages AI session contexts.
 * Enables agents to share information during generation.
 */

import type {
  SessionContext,
  AgentOutput,
  AgentExecutionContext,
} from "./ContextTypes";
import { createSessionId } from "./ContextTypes";

export class ContextManager {
  private sessions: Map<string, SessionContext> = new Map();
  private maxSessions = 50;

  /**
   * Create a new session context for a generation run.
   */
  createSession(
    projectId: string,
    blueprint: Record<string, unknown> = {},
  ): SessionContext {
    this.evictIfNeeded();
    const session: SessionContext = {
      sessionId: createSessionId(),
      projectId,
      gameBlueprint: blueprint,
      activeAgent: null,
      previousOutputs: [],
      decisions: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Get an existing session.
   */
  getSession(sessionId: string): SessionContext | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Set the currently active agent for a session.
   */
  setActiveAgent(sessionId: string, agentId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.activeAgent = agentId;
      session.updatedAt = Date.now();
    }
  }

  /**
   * Record an agent's output into the session context.
   */
  recordOutput(
    sessionId: string,
    agentId: string,
    output: Record<string, unknown>,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.previousOutputs.push({ agentId, output, timestamp: Date.now() });
    session.updatedAt = Date.now();
  }

  /**
   * Record a decision made during generation.
   */
  recordDecision(
    sessionId: string,
    agentId: string,
    type: string,
    description: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.decisions.push({
      agentId,
      type,
      description,
      timestamp: Date.now(),
    });
    session.updatedAt = Date.now();
  }

  /**
   * Get all outputs from previous agents in this session.
   */
  getPreviousOutputs(sessionId: string): AgentOutput[] {
    return this.sessions.get(sessionId)?.previousOutputs ?? [];
  }

  /**
   * Get accumulated context as a flat record for prompt injection.
   */
  getAccumulatedContext(sessionId: string): Record<string, unknown> {
    const session = this.sessions.get(sessionId);
    if (!session) return {};
    const accumulated: Record<string, unknown> = { ...session.gameBlueprint };
    for (const output of session.previousOutputs) {
      Object.assign(accumulated, output.output);
    }
    return accumulated;
  }

  /**
   * Build execution context for a specific agent.
   */
  buildExecutionContext(
    sessionId: string,
    agentId: string,
    input: Record<string, unknown>,
    memory: unknown[] = [],
  ): AgentExecutionContext | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    this.setActiveAgent(sessionId, agentId);
    return { session, relevantMemory: memory, agentId, input };
  }

  /**
   * Update session metadata.
   */
  setMetadata(sessionId: string, key: string, value: unknown): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata[key] = value;
      session.updatedAt = Date.now();
    }
  }

  /**
   * Close a session (mark complete).
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.activeAgent = null;
      session.updatedAt = Date.now();
    }
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  private evictIfNeeded(): void {
    if (this.sessions.size < this.maxSessions) return;
    const oldest = [...this.sessions.entries()].sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt,
    )[0];
    if (oldest) this.sessions.delete(oldest[0]);
  }
}
