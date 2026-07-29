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

export type {
  PipelineEvent,
  PipelineEventHandler,
  PipelineEventPublisher,
  PipelineEventType,
} from "../types/pipeline-events";

export interface WorkflowState {
  pipelineId: string;
  status: "idle" | "running" | "completed" | "failed" | "paused" | "cancelled";
  steps: Map<string, PipelineStep>;
  startedAt: Date;
  completedAt?: Date;
  markStepCompleted(stepId: string, result: unknown): void;
  markStepFailed(stepId: string, error: string): void;
}

export interface StepExecutionContext {
  step: PipelineStep;
  state: WorkflowState;
  previousOutputs: Record<string, unknown>;
}
