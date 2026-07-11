/**
 * PipelineStore — Abstract interface for pipeline state persistence.
 */

import type { PipelineState } from "../PipelineStage";

export interface PipelineStore {
  /** Save or update a pipeline state. */
  save(state: PipelineState): void;
  /** Get a pipeline by ID. */
  get(pipelineId: string): PipelineState | null;
  /** Get all stored pipelines. */
  getAll(): PipelineState[];
  /** Delete a pipeline by ID. */
  delete(pipelineId: string): boolean;
  /** Check if a pipeline exists. */
  has(pipelineId: string): boolean;
  /** Get count of stored pipelines. */
  count(): number;
  /** Get pipelines by status. */
  getByStatus(status: string): PipelineState[];
  /** Mark running pipelines as interrupted (for recovery after restart). */
  markInterrupted(): number;
}
