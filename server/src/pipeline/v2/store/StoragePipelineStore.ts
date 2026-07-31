/**
 * StoragePipelineStore — Provider-backed operational pipeline state.
 *
 * Runtime execution handles remain process-local. Only serializable pipeline
 * state is persisted through the acknowledged StorageProvider boundary.
 */

import type {
  DurableMutation,
  StorageProvider,
} from "../../../platform/storage/StorageProvider";
import type { PipelineState } from "../PipelineStage";

const PIPELINE_STATES = "pipeline_runtime_states";

export class StoragePipelineStore {
  constructor(private readonly storage: StorageProvider) {}

  async save(state: PipelineState): Promise<void> {
    const snapshot = this.clone(state);
    await this.storage.setDurable(
      PIPELINE_STATES,
      snapshot.pipelineId,
      snapshot,
    );
  }

  get(pipelineId: string): PipelineState | null {
    const state = this.storage.get<PipelineState>(PIPELINE_STATES, pipelineId);
    return state ? this.clone(state) : null;
  }

  getAll(): PipelineState[] {
    return this.storage
      .list<PipelineState>(PIPELINE_STATES)
      .map((state) => this.clone(state));
  }

  async delete(pipelineId: string): Promise<boolean> {
    return this.storage.deleteDurable(PIPELINE_STATES, pipelineId);
  }

  has(pipelineId: string): boolean {
    return this.storage.get(PIPELINE_STATES, pipelineId) !== null;
  }

  count(): number {
    return this.storage.list(PIPELINE_STATES).length;
  }

  getByStatus(status: string): PipelineState[] {
    return this.storage
      .list<PipelineState>(
        PIPELINE_STATES,
        (candidate) => candidate.status === status,
      )
      .map((state) => this.clone(state));
  }

  async markInterrupted(): Promise<number> {
    const running = this.storage.list<PipelineState>(
      PIPELINE_STATES,
      (candidate) => candidate.status === "running",
    );
    if (running.length === 0) return 0;

    const now = Date.now();
    const mutations: DurableMutation[] = running.map((state) => {
      const interrupted = this.clone(state);
      interrupted.status = "failed";
      interrupted.finishedAt = now;
      interrupted.currentStage = null;

      for (const stage of interrupted.stages) {
        if (stage.status !== "running") continue;
        stage.status = "failed";
        stage.error = "Interrupted: server restart";
        stage.completedAt = now;
        if (!interrupted.failedStages.includes(stage.name)) {
          interrupted.failedStages.push(stage.name);
        }
      }

      return {
        operation: "set",
        collection: PIPELINE_STATES,
        id: interrupted.pipelineId,
        data: interrupted,
      };
    });

    await this.storage.applyDurableBatch(mutations);
    return mutations.length;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
