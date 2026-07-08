/**
 * Pipeline event system.
 */

import type { StageName, PipelineStatus } from "./PipelineStage";

export type PipelineEventType =
  | "pipeline.started"
  | "stage.started"
  | "stage.completed"
  | "stage.failed"
  | "pipeline.completed"
  | "pipeline.failed";

export interface PipelineEventData {
  type: PipelineEventType;
  pipelineId: string;
  projectId: string;
  stage?: StageName;
  status?: PipelineStatus;
  error?: string;
  timestamp: number;
  durationMs?: number;
}

export type PipelineEventHandler = (event: PipelineEventData) => void;

export class PipelineEventEmitterV2 {
  private handlers: PipelineEventHandler[] = [];
  private history: PipelineEventData[] = [];

  on(handler: PipelineEventHandler): void {
    this.handlers.push(handler);
  }
  off(handler: PipelineEventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  emit(event: PipelineEventData): void {
    this.history.push(event);
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        /* non-blocking */
      }
    }
  }

  getHistory(): PipelineEventData[] {
    return [...this.history];
  }
  clear(): void {
    this.history = [];
  }
}
