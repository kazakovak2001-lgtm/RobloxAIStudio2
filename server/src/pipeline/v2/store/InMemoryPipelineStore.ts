/**
 * InMemoryPipelineStore — Default non-persistent pipeline store.
 */

import type { PipelineState } from "../PipelineStage";
import type { PipelineStore } from "./PipelineStore";

export class InMemoryPipelineStore implements PipelineStore {
  private pipelines: Map<string, PipelineState> = new Map();

  save(state: PipelineState): void {
    this.pipelines.set(state.pipelineId, state);
  }

  get(pipelineId: string): PipelineState | null {
    return this.pipelines.get(pipelineId) ?? null;
  }

  getAll(): PipelineState[] {
    return Array.from(this.pipelines.values());
  }

  delete(pipelineId: string): boolean {
    return this.pipelines.delete(pipelineId);
  }

  has(pipelineId: string): boolean {
    return this.pipelines.has(pipelineId);
  }

  count(): number {
    return this.pipelines.size;
  }

  getByStatus(status: string): PipelineState[] {
    return this.getAll().filter((p) => p.status === status);
  }

  markInterrupted(): number {
    let count = 0;
    for (const state of this.pipelines.values()) {
      if (state.status === "running") {
        state.status = "failed";
        state.finishedAt = Date.now();
        state.currentStage = null;
        // Find the running stage and mark it failed
        for (const stage of state.stages) {
          if (stage.status === "running") {
            stage.status = "failed";
            stage.error = "Interrupted: server restart";
            stage.completedAt = Date.now();
            state.failedStages.push(stage.name);
          }
        }
        count++;
      }
    }
    return count;
  }
}
