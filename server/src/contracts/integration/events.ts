import type { PipelineEventType } from "../../types/pipeline-events";

/**
 * Frontend integration event contract.
 * Reuses the existing backend pipeline event taxonomy.
 */
export type IntegrationPipelineEvent = Extract<
  PipelineEventType,
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "generation.started"
  | "generation.completed"
  | "generation.failed"
  | "studio.connected"
  | "studio.disconnected"
  | "studio.sync.update"
>;

export interface PipelineEventPayload {
  pipelineId: string;
  projectId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface PipelineStepPayload extends PipelineEventPayload {
  stepId?: string;
  agentId?: string;
  status?: "started" | "completed" | "failed";
  progress?: number;
  output?: unknown;
  error?: unknown;
}
