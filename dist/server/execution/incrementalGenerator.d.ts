export declare class IncrementalGenerator {
    private checkpoints;
    saveCheckpoint(pipelineId: string, stage: string, data: unknown): Promise<void>;
    loadCheckpoint(pipelineId: string, stage: string): Promise<unknown | null>;
    clearCheckpoints(pipelineId: string): Promise<void>;
    getStats(): {
        totalCheckpoints: number;
    };
}
