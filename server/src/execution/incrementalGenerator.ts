export class IncrementalGenerator {
  private checkpoints = new Map<string, unknown>();

  async saveCheckpoint(pipelineId: string, stage: string, data: unknown): Promise<void> {
    this.checkpoints.set(`${pipelineId}:${stage}`, data);
  }

  async loadCheckpoint(pipelineId: string, stage: string): Promise<unknown | null> {
    return this.checkpoints.get(`${pipelineId}:${stage}`) ?? null;
  }

  async clearCheckpoints(pipelineId: string): Promise<void> {
    for (const key of this.checkpoints.keys()) {
      if (key.startsWith(pipelineId)) {
        this.checkpoints.delete(key);
      }
    }
  }

  getStats() {
    return {
      totalCheckpoints: this.checkpoints.size,
    };
  }
}