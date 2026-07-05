/**
 * MemoryRegistry.ts
 *
 * Single source of truth for all active ProjectMemory instances.
 * Keyed by executionId — one ProjectMemory per pipeline run.
 *
 * Responsibilities:
 *  - Create memory for a new execution
 *  - Retrieve memory by executionId
 *  - Evict stale memory after completion
 *  - Expose summaries for monitoring
 */

import type { ProjectInfo } from "./MemoryTypes";
import { ProjectMemory } from "./ProjectMemory";
import { createProjectContext } from "./ProjectContext";

export class MemoryRegistry {
  private instances = new Map<string, ProjectMemory>();
  /** Keep the last N completed executions for debugging. Default: 10. */
  private maxHistory: number;

  constructor(maxHistory = 10) {
    this.maxHistory = maxHistory;
  }

  /**
   * Create and register a new ProjectMemory for an execution.
   * If one already exists for this executionId it is replaced.
   */
  create(
    executionId: string,
    blueprintId?: string,
    projectInfo?: ProjectInfo,
  ): ProjectMemory {
    const context = createProjectContext(executionId, blueprintId, projectInfo);
    const memory = new ProjectMemory(context);
    this.instances.set(executionId, memory);
    console.log(`[MEMORY] Created | ExecutionId: ${executionId}`);
    return memory;
  }

  /**
   * Retrieve an existing ProjectMemory by executionId.
   * Returns null if not found.
   */
  get(executionId: string): ProjectMemory | null {
    return this.instances.get(executionId) ?? null;
  }

  /**
   * Check whether memory exists for an executionId.
   */
  has(executionId: string): boolean {
    return this.instances.has(executionId);
  }

  /**
   * Remove a ProjectMemory instance (call after pipeline completes).
   * Keeps the last `maxHistory` entries for post-run inspection.
   */
  evict(executionId: string): void {
    // Evict oldest entries if over capacity
    if (this.instances.size > this.maxHistory) {
      const oldest = this.instances.keys().next().value;
      if (oldest && oldest !== executionId) {
        this.instances.delete(oldest);
      }
    }
  }

  /**
   * Return summaries for all active memory instances.
   */
  getAllSummaries() {
    const summaries: Array<ReturnType<ProjectMemory["getSummary"]>> = [];
    for (const memory of this.instances.values()) {
      summaries.push(memory.getSummary());
    }
    return summaries;
  }

  /**
   * Number of active memory instances.
   */
  get size(): number {
    return this.instances.size;
  }
}

/** Process-singleton default registry. */
let _defaultRegistry: MemoryRegistry | null = null;

export function getDefaultMemoryRegistry(): MemoryRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new MemoryRegistry();
  }
  return _defaultRegistry;
}
