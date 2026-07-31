/**
 * InMemoryPipelineStore — Default non-persistent pipeline store.
 */

import type { PipelineState } from "../PipelineStage";
import type { PipelineStore } from "./PipelineStore";

export class InMemoryPipelineStore implements PipelineStore {
  private pipelines: Map<string, PipelineState> = new Map();

  async save(state: PipelineState): Promise<void> {
    this.pipelines.set(state.pipelineId, state);
  }

  get(pipelineId: string): PipelineState | null {
    return this.pipelines.get(pipelineId) ?? null;
  }

  getAll(): PipelineState[] {
    return Array.from(this.pipelines.values());
  }

  async delete(pipelineId: string): Promise<boolean> {
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

  async markInterrupted(): Promise<number> {
    let count = 0;
    for (const state of this.pipelines.values()) {
      if (state.status === "running") {
        state.status = "failed";
        state.finishedAt = Date.now();
        state.currentStage = null;
        for (const stage of state.stages) {
          if (stage.status === "running") {
            stage.status = "failed";
            stage.error = "Interrupted: server restart";
            stage.completedAt = Date.now();
            if (!state.failedStages.includes(stage.name)) {
              state.failedStages.push(stage.name);
            }
          }
        }
        count++;
      }
    }
    return count;
  }
}
