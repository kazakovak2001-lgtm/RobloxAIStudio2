/**
 * MemoryManager.ts
 *
 * Lightweight façade agents receive as `input.memory`.
 * Exposes the agent read/write API defined by the task spec:
 *   readContext() writeContext() appendDecision() appendWarning() appendRecommendation()
 *
 * Agents NEVER receive a direct reference to ProjectMemory — they only
 * see this typed API. All cross-agent communication happens through context.
 */

import type {
  ProjectContext,
  ArchitecturalDecision,
  DecisionCategory,
  DecisionStatus,
} from "./MemoryTypes";
import type { ProjectMemory } from "./ProjectMemory";

export class MemoryManager {
  constructor(
    private readonly memory: ProjectMemory,
    private readonly agentName: string,
  ) {}

  // ─── Read ──────────────────────────────────────────────────────────────────

  /**
   * Read the current immutable project context.
   */
  readContext(): Readonly<ProjectContext> {
    return this.memory.readContext();
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  /**
   * Write a partial context update. Only provided sections are merged.
   * Agents use this to publish their outputs to shared memory.
   */
  writeContext(
    update: Parameters<ProjectMemory["writeContext"]>[0],
    section: string,
  ): void {
    this.memory.writeContext(update, this.agentName, section);
  }

  // ─── Decisions ─────────────────────────────────────────────────────────────

  /**
   * Record an architectural decision made by this agent.
   */
  appendDecision(options: {
    category: DecisionCategory;
    summary: string;
    details: string;
    reason: string;
    impact: string;
    status?: DecisionStatus;
  }): ArchitecturalDecision {
    return this.memory.appendDecision(
      this.agentName,
      options.category,
      options.summary,
      options.details,
      options.reason,
      options.impact,
      options.status ?? "accepted",
    );
  }

  // ─── Warnings / Recommendations ────────────────────────────────────────────

  appendWarning(message: string): void {
    this.memory.appendWarning(message, this.agentName);
  }

  appendRecommendation(message: string): void {
    this.memory.appendRecommendation(message, this.agentName);
  }

  // ─── Read-only history ─────────────────────────────────────────────────────

  getDecisions(): ReadonlyArray<ArchitecturalDecision> {
    return this.memory.getDecisions();
  }
}
