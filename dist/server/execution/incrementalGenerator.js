export class IncrementalGenerator {
    constructor() {
        this.checkpoints = new Map();
    }
    async saveCheckpoint(pipelineId, stage, data) {
        this.checkpoints.set(`${pipelineId}:${stage}`, data);
    }
    async loadCheckpoint(pipelineId, stage) {
        return this.checkpoints.get(`${pipelineId}:${stage}`) ?? null;
    }
    async clearCheckpoints(pipelineId) {
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
