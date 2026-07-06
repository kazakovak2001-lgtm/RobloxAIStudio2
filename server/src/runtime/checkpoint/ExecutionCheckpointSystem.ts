/**
 * ExecutionCheckpointSystem.ts
 *
 * Snapshot persistence for each pipeline phase.
 * Enables:
 *   - Resume execution from last valid checkpoint
 *   - Audit trail of all intermediate states
 *   - Rollback to any known-good state
 */

import { randomUUID } from "crypto";

export interface Checkpoint {
  id: string;
  executionId: string;
  phase: string;
  state: unknown;
  createdAt: number;
  sizeBytes: number;
}

export class ExecutionCheckpointSystem {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private byExecution: Map<string, string[]> = new Map();
  private maxPerExecution = 20;

  /**
   * Create a checkpoint for a phase.
   */
  createCheckpoint(
    executionId: string,
    phase: string,
    state: unknown,
  ): Checkpoint {
    const serialized = JSON.stringify(state);
    const checkpoint: Checkpoint = {
      id: `cp-${randomUUID().slice(0, 12)}`,
      executionId,
      phase,
      state: JSON.parse(serialized), // deep clone
      createdAt: Date.now(),
      sizeBytes: serialized.length * 2,
    };

    this.checkpoints.set(checkpoint.id, checkpoint);

    const execCheckpoints = this.byExecution.get(executionId) ?? [];
    execCheckpoints.push(checkpoint.id);
    if (execCheckpoints.length > this.maxPerExecution) {
      const removed = execCheckpoints.shift()!;
      this.checkpoints.delete(removed);
    }
    this.byExecution.set(executionId, execCheckpoints);

    return checkpoint;
  }

  /**
   * Get a checkpoint by ID.
   */
  getCheckpoint(id: string): Checkpoint | null {
    return this.checkpoints.get(id) ?? null;
  }

  /**
   * Get all checkpoints for an execution.
   */
  getCheckpointsForExecution(executionId: string): Checkpoint[] {
    const ids = this.byExecution.get(executionId) ?? [];
    return ids.map((id) => this.checkpoints.get(id)!).filter(Boolean);
  }

  /**
   * Get the latest checkpoint for an execution.
   */
  getLatestCheckpoint(executionId: string): Checkpoint | null {
    const ids = this.byExecution.get(executionId) ?? [];
    if (ids.length === 0) return null;
    return this.checkpoints.get(ids[ids.length - 1]) ?? null;
  }

  /**
   * Get the latest checkpoint for a specific phase.
   */
  getCheckpointForPhase(executionId: string, phase: string): Checkpoint | null {
    const all = this.getCheckpointsForExecution(executionId);
    const phaseCheckpoints = all.filter((cp) => cp.phase === phase);
    return phaseCheckpoints.length > 0
      ? phaseCheckpoints[phaseCheckpoints.length - 1]
      : null;
  }

  /**
   * Delete all checkpoints for an execution.
   */
  clearExecution(executionId: string): void {
    const ids = this.byExecution.get(executionId) ?? [];
    for (const id of ids) {
      this.checkpoints.delete(id);
    }
    this.byExecution.delete(executionId);
  }

  /**
   * Export all checkpoints for an execution as JSON.
   */
  exportExecution(executionId: string): string {
    const checkpoints = this.getCheckpointsForExecution(executionId);
    return JSON.stringify(checkpoints, null, 2);
  }

  get totalCheckpoints(): number {
    return this.checkpoints.size;
  }
}
