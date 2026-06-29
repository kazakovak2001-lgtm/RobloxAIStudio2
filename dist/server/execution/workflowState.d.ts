export type PipelineEventType = "step.started" | "step.completed" | "step.failed" | "pipeline.started" | "pipeline.completed" | "pipeline.failed" | "pipeline.paused" | "pipeline.cancelled" | "pipeline.running" | "pipeline.idle";
export interface PipelineEvent {
    type: PipelineEventType;
    pipelineId: string;
    stepId?: string;
    data?: Record<string, unknown>;
    timestamp: Date;
}
export interface PipelineStep {
    id: string;
    agent: string;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    input?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    retryCount: number;
    startedAt?: Date;
    finishedAt?: Date;
}
export interface WorkflowState {
    pipelineId: string;
    status: "idle" | "running" | "completed" | "failed" | "paused" | "cancelled";
    steps: Map<string, PipelineStep>;
    startedAt: Date;
    completedAt?: Date;
    markStepCompleted(stepId: string, result: unknown): void;
    markStepFailed(stepId: string, error: string): void;
    markStepRunning(stepId: string): void;
}
export declare class PipelineWorkflowState implements WorkflowState {
    pipelineId: string;
    status: "idle" | "running" | "completed" | "failed" | "paused" | "cancelled";
    steps: Map<string, PipelineStep>;
    startedAt: Date;
    completedAt?: Date;
    constructor(pipelineId: string);
    markStepCompleted(stepId: string, result: unknown): void;
    markStepFailed(stepId: string, error: string): void;
    markStepRunning(stepId: string): void;
}
