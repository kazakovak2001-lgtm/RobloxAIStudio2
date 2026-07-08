/**
 * MemoryStore — In-memory storage for AI agent execution history.
 * Stores decisions, outputs, validations, corrections, and failures.
 */

import type { MemoryEntryData, MemoryType } from "./MemoryEntry";
import { createMemoryEntry } from "./MemoryEntry";

export class AIMemoryStore {
  private entries: MemoryEntryData[] = [];
  private maxEntries = 2000;

  /**
   * Store a new memory entry.
   */
  store(params: Omit<MemoryEntryData, "id" | "timestamp">): MemoryEntryData {
    const entry = createMemoryEntry(params);
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    return entry;
  }

  /**
   * Retrieve entries by agent ID.
   */
  getByAgent(agentId: string): MemoryEntryData[] {
    return this.entries.filter((e) => e.agentId === agentId);
  }

  /**
   * Retrieve entries by session.
   */
  getBySession(sessionId: string): MemoryEntryData[] {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  /**
   * Retrieve entries by type.
   */
  getByType(type: MemoryType): MemoryEntryData[] {
    return this.entries.filter((e) => e.type === type);
  }

  /**
   * Search entries by tags.
   */
  searchByTags(tags: string[]): MemoryEntryData[] {
    return this.entries.filter((e) => tags.some((t) => e.tags.includes(t)));
  }

  /**
   * Get most important entries (sorted by importance descending).
   */
  getTopImportance(limit = 10): MemoryEntryData[] {
    return [...this.entries]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * Get recent entries for a session, relevant to an agent.
   */
  getRelevantForAgent(
    sessionId: string,
    agentId: string,
    limit = 20,
  ): MemoryEntryData[] {
    return this.entries
      .filter((e) => e.sessionId === sessionId || e.agentId === agentId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  get size(): number {
    return this.entries.length;
  }
  clear(): void {
    this.entries = [];
  }
}
