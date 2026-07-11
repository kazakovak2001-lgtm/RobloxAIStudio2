/**
 * Pipeline Event — Central typed event system for pipeline observability.
 */

import { randomUUID } from "crypto";

export type PipelineEventType =
  | "PipelineStarted"
  | "StageStarted"
  | "StageCompleted"
  | "StageFailed"
  | "PipelinePaused"
  | "PipelineCancelled"
  | "PipelineRecovered"
  | "PipelineCompleted"
  | "PipelineFailed";

export interface PipelineEvent {
  id: string;
  pipelineId: string;
  timestamp: Date;
  type: PipelineEventType;
  stage?: string;
  payload?: unknown;
}

export function createPipelineEvent(
  pipelineId: string,
  type: PipelineEventType,
  stage?: string,
  payload?: unknown,
): PipelineEvent {
  return {
    id: `evt-${randomUUID().slice(0, 12)}`,
    pipelineId,
    timestamp: new Date(),
    type,
    stage,
    payload,
  };
}
