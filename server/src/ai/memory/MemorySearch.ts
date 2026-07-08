/**
 * MemorySearch — Query interface for the AI memory store.
 */

import { AIMemoryStore } from "./MemoryStore";
import type { MemoryEntryData, MemoryType } from "./MemoryEntry";

export interface MemoryQuery {
  sessionId?: string;
  agentId?: string;
  type?: MemoryType;
  tags?: string[];
  minImportance?: number;
  limit?: number;
}

export class MemorySearch {
  constructor(private store: AIMemoryStore) {}

  query(q: MemoryQuery): MemoryEntryData[] {
    let results: MemoryEntryData[] = [];

    if (q.sessionId && q.agentId) {
      results = this.store.getRelevantForAgent(
        q.sessionId,
        q.agentId,
        q.limit ?? 50,
      );
    } else if (q.sessionId) {
      results = this.store.getBySession(q.sessionId);
    } else if (q.agentId) {
      results = this.store.getByAgent(q.agentId);
    } else if (q.type) {
      results = this.store.getByType(q.type);
    } else if (q.tags && q.tags.length > 0) {
      results = this.store.searchByTags(q.tags);
    } else {
      results = this.store.getTopImportance(q.limit ?? 20);
    }

    if (q.minImportance) {
      results = results.filter((e) => e.importance >= q.minImportance!);
    }

    if (q.limit && results.length > q.limit) {
      results = results.slice(0, q.limit);
    }

    return results;
  }
}
