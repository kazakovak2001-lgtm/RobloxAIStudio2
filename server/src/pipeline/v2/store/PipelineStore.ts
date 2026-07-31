/**
 * PipelineStore — Abstract interface for pipeline state persistence.
 */

import type { PipelineState } from "../PipelineStage";

export interface PipelineStore {
  /** Save or update a pipeline state after persistence acknowledgement. */
  save(state: PipelineState): Promise<void>;
  /** Get a pipeline by ID. */
  get(pipelineId: string): PipelineState | null;
  /** Get all stored pipelines. */
  getAll(): PipelineState[];
  /** Delete a pipeline by ID after persistence acknowledgement. */
  delete(pipelineId: string): Promise<boolean>;
  /** Check if a pipeline exists. */
  has(pipelineId: string): boolean;
  /** Get count of stored pipelines. */
  count(): number;
  /** Get pipelines by status. */
  getByStatus(status: string): PipelineState[];
  /** Mark running pipelines as interrupted after recovery acknowledgement. */
  markInterrupted(): Promise<number>;
}
