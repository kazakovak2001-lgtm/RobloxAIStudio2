/**
 * Pipeline Audit Log — Types and storage interface for pipeline history.
 */

import { randomUUID } from "crypto";

export interface PipelineAuditEntry {
  id: string;
  pipelineId: string;
  timestamp: Date;
  eventType: string;
  stage?: string;
  message: string;
  metadata?: unknown;
}

export interface PipelineAuditStore {
  append(entry: PipelineAuditEntry): void;
  getHistory(pipelineId: string): PipelineAuditEntry[];
  getAll(): PipelineAuditEntry[];
  count(): number;
}

export function createAuditEntry(
  pipelineId: string,
  eventType: string,
  message: string,
  stage?: string,
  metadata?: unknown,
): PipelineAuditEntry {
  return {
    id: `audit-${randomUUID().slice(0, 10)}`,
    pipelineId,
    timestamp: new Date(),
    eventType,
    stage,
    message,
    metadata,
  };
}
