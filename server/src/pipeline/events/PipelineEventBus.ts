/**
 * PipelineEventBus — Interface for pipeline event dispatch.
 */

import type { PipelineEvent } from "./PipelineEvent";

export type PipelineEventHandler = (event: PipelineEvent) => void;

export interface PipelineEventBus {
  emit(event: PipelineEvent): void;
  subscribe(handler: PipelineEventHandler): void;
  unsubscribe(handler: PipelineEventHandler): void;
}
