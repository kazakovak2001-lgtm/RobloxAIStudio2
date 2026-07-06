/**
 * MemoryIndex.ts
 *
 * Fast lookup cache layer for memory retrieval optimization.
 * Indexes entries by agentId + projectId for O(1) lookup.
 */

import type { MemoryEntry } from "../store/MemoryStore";

export class MemoryIndex {
  /** agentId → latest N entry IDs */
  private agentIndex = new Map<string, string[]>();
  /** projectId → latest N entry IDs */
  private projectIndex = new Map<string, string[]>();
  /** id → entry reference */
  private entryMap = new Map<string, MemoryEntry>();
  private maxPerIndex: number;

  constructor(maxPerIndex = 50) {
    this.maxPerIndex = maxPerIndex;
  }

  /**
   * Index a memory entry for fast lookup.
   */
  index(entry: MemoryEntry): void {
    this.entryMap.set(entry.id, entry);

    // Agent index
    const agentList = this.agentIndex.get(entry.agentId) ?? [];
    agentList.push(entry.id);
    if (agentList.length > this.maxPerIndex) agentList.shift();
    this.agentIndex.set(entry.agentId, agentList);

    // Project index
    if (entry.projectId) {
      const projList = this.projectIndex.get(entry.projectId) ?? [];
      projList.push(entry.id);
      if (projList.length > this.maxPerIndex) projList.shift();
      this.projectIndex.set(entry.projectId, projList);
    }
  }

  /**
   * Fast lookup by agent.
   */
  getByAgent(agentId: string, limit = 10): MemoryEntry[] {
    const ids = this.agentIndex.get(agentId) ?? [];
    return ids
      .slice(-limit)
      .map((id) => this.entryMap.get(id)!)
      .filter(Boolean);
  }

  /**
   * Fast lookup by project.
   */
  getByProject(projectId: string, limit = 10): MemoryEntry[] {
    const ids = this.projectIndex.get(projectId) ?? [];
    return ids
      .slice(-limit)
      .map((id) => this.entryMap.get(id)!)
      .filter(Boolean);
  }

  /**
   * Check if an entry is indexed.
   */
  has(id: string): boolean {
    return this.entryMap.has(id);
  }

  get size(): number {
    return this.entryMap.size;
  }

  getStats() {
    return {
      totalEntries: this.entryMap.size,
      agentBuckets: this.agentIndex.size,
      projectBuckets: this.projectIndex.size,
    };
  }
}
