/**
 * Pipeline execution context — wraps ContextManager for pipeline use.
 */

import { ContextManager } from "../../ai/context";
import { AIMemoryStore } from "../../ai/memory";

export class PipelineContext {
  readonly contextManager: ContextManager;
  readonly memoryStore: AIMemoryStore;

  constructor() {
    this.contextManager = new ContextManager();
    this.memoryStore = new AIMemoryStore();
  }

  /**
   * Create a new pipeline session and return the sessionId.
   */
  createSession(projectId: string, blueprint: Record<string, unknown>): string {
    const session = this.contextManager.createSession(projectId, blueprint);
    return session.sessionId;
  }

  /**
   * Get accumulated outputs for prompt enrichment.
   */
  getAccumulated(sessionId: string): Record<string, unknown> {
    return this.contextManager.getAccumulatedContext(sessionId);
  }

  /**
   * Record an agent's output.
   */
  recordAgentOutput(
    sessionId: string,
    agentId: string,
    output: Record<string, unknown>,
  ): void {
    this.contextManager.recordOutput(sessionId, agentId, output);
    this.memoryStore.store({
      type: "output",
      agentId,
      sessionId,
      content: output,
      importance: 5,
      tags: [agentId],
    });
  }

  /**
   * Record a failure for memory and learning.
   */
  recordFailure(sessionId: string, agentId: string, error: string): void {
    this.memoryStore.store({
      type: "failure",
      agentId,
      sessionId,
      content: { error },
      importance: 8,
      tags: [agentId, "error"],
    });
  }
}
