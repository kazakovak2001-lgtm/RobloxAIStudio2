import type { PipelineEventType } from "../../types/pipeline-events";

/**
 * Curated frontend integration event contract.
 * This allowlist contains the pipeline, step, evaluation, generation, and
 * Studio events forwarded to the standalone Frontend integration layer.
 */
export type IntegrationPipelineEvent = Extract<
  PipelineEventType,
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.preview.completed"
  | "pipeline.failed"
  | "step.started"
  | "step.completed"
  | "step.simulated"
  | "step.skipped"
  | "step.failed"
  | "evaluation.started"
  | "evaluation.completed"
  | "evaluation.failed"
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
  stepId: string;
  agentId?: string;
  status: "started" | "completed" | "simulated" | "skipped" | "failed";
  progress?: number;
  output?: unknown;
  error?: unknown;
}

export type IntegrationEventPayloadMap = {
  [EventName in IntegrationPipelineEvent]: EventName extends `step.${string}`
    ? PipelineStepPayload
    : PipelineEventPayload;
};

export type IntegrationEvent<
  EventName extends IntegrationPipelineEvent = IntegrationPipelineEvent,
> = {
  type: EventName;
  payload: IntegrationEventPayloadMap[EventName];
};
