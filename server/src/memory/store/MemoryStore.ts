/**
 * MemoryStore.ts
 *
 * Long-term memory storage layer.
 * In-memory implementation with pluggable backend abstraction.
 * Stores per-agent, per-project knowledge across sessions.
 *
 * Future: swap to filesystem/DB without changing the API.
 */

export interface MemoryEntry {
  id: string;
  agentId: string;
  projectId?: string;
  content: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export class MemoryStore {
  private entries: MemoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Store a memory entry.
   */
  store(entry: MemoryEntry): void {
    this.entries.push(entry);
    // Evict oldest if over capacity
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * Get entries for a specific agent, optionally filtered by project.
   */
  getByAgent(agentId: string, projectId?: string, limit = 10): MemoryEntry[] {
    let filtered = this.entries.filter((e) => e.agentId === agentId);
    if (projectId) {
      filtered = filtered.filter((e) => e.projectId === projectId);
    }
    return filtered.slice(-limit);
  }

  /**
   * Get all entries for a project across all agents.
   */
  getByProject(projectId: string, limit = 20): MemoryEntry[] {
    return this.entries.filter((e) => e.projectId === projectId).slice(-limit);
  }

  /**
   * Search entries by content key existence.
   */
  searchByKey(key: string): MemoryEntry[] {
    return this.entries.filter((e) => key in e.content);
  }

  /**
   * Get the most recent N entries globally.
   */
  getRecent(limit = 10): MemoryEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Clear all entries for an agent.
   */
  clearAgent(agentId: string): void {
    this.entries = this.entries.filter((e) => e.agentId !== agentId);
  }

  /**
   * Clear all entries for a project.
   */
  clearProject(projectId: string): void {
    this.entries = this.entries.filter((e) => e.projectId !== projectId);
  }

  get size(): number {
    return this.entries.length;
  }

  getStats() {
    const agentCounts: Record<string, number> = {};
    for (const e of this.entries) {
      agentCounts[e.agentId] = (agentCounts[e.agentId] ?? 0) + 1;
    }
    return { totalEntries: this.entries.length, byAgent: agentCounts };
  }
}
