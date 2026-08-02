export type PipelineLifecycleEvent =
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed";

export type PipelineStepEvent =
  | "step.started"
  | "step.completed"
  | "step.failed";

export interface PipelineEventPayload {
  pipelineId: string;
  projectId?: string;
  timestamp: string;
}

export interface PipelineStepPayload extends PipelineEventPayload {
  stepId?: string;
  agentId?: string;
  status?: "started" | "completed" | "failed";
  progress?: number;
  output?: unknown;
  error?: unknown;
}
