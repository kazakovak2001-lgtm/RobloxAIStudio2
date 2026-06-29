export interface PipelineContext {
    pipelineId: string;
    projectId: string;
    userId: string;
    input: Record<string, unknown>;
    results: Map<string, unknown>;
    metadata: Record<string, unknown>;
}
export interface PipelineStep {
    id: string;
    agent: string;
    status: "pending" | "running" | "completed" | "failed";
    input?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    retryCount: number;
    startedAt?: Date;
    finishedAt?: Date;
}
export type PipelineEventType = "step.started" | "step.completed" | "step.failed" | "pipeline.started" | "pipeline.completed" | "pipeline.failed";
export interface PipelineEvent {
    type: PipelineEventType;
    pipelineId: string;
    stepId?: string;
    data?: Record<string, unknown>;
    timestamp: Date;
}
export interface WorkflowState {
    pipelineId: string;
    status: "idle" | "running" | "completed" | "failed";
    markStepCompleted(stepId: string, result: unknown): void;
    markStepFailed(stepId: string, error: string): void;
}
export interface StepExecutionContext {
    step: PipelineStep;
    state: WorkflowState;
    previousOutputs: Record<string, unknown>;
}
export type PipelineEventHandler = (event: PipelineEvent) => void | Promise<void>;
