/**
 * InMemoryAuditStore — Default in-memory audit log storage.
 */

import type {
  PipelineAuditEntry,
  PipelineAuditStore,
} from "./PipelineAuditLog";

export class InMemoryAuditStore implements PipelineAuditStore {
  private entries: PipelineAuditEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries;
  }

  append(entry: PipelineAuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-Math.round(this.maxEntries * 0.75));
    }
  }

  getHistory(pipelineId: string): PipelineAuditEntry[] {
    return this.entries.filter((e) => e.pipelineId === pipelineId);
  }

  getAll(): PipelineAuditEntry[] {
    return [...this.entries];
  }

  count(): number {
    return this.entries.length;
  }
}
