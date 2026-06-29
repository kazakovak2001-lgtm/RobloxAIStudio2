export type PipelineEventType = 
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed"
  | "pipeline.paused"
  | "pipeline.cancelled"
  | "pipeline.running"
  | "pipeline.idle";

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

export class PipelineWorkflowState implements WorkflowState {
  public pipelineId: string;
  public status: "idle" | "running" | "completed" | "failed" | "paused" | "cancelled";
  public steps: Map<string, PipelineStep>;
  public startedAt: Date;
  public completedAt?: Date;

  constructor(pipelineId: string) {
    this.pipelineId = pipelineId;
    this.status = "idle";
    this.steps = new Map();
    this.startedAt = new Date();
  }

  markStepCompleted(stepId: string, result: unknown): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.status = "completed";
      step.result = result;
      step.finishedAt = new Date();
    }
  }

  markStepFailed(stepId: string, error: string): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.status = "failed";
      step.error = error;
      step.finishedAt = new Date();
    }
  }

  markStepRunning(stepId: string): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.status = "running";
      step.startedAt = new Date();
    }
  }
}