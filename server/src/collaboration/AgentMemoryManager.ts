/**
 * AgentMemoryManager.ts
 *
 * Isolated memory per agent + shared read-only context.
 * Each agent writes only to its own memory space.
 * Shared context is derived from EventStore (read-only).
 */

import type { AgentMemorySnapshot } from "./CollaborationTypes";

export class AgentMemoryManager {
  private memories = new Map<string, Record<string, unknown>>();
  private snapshots = new Map<string, AgentMemorySnapshot[]>();
  private sharedContext: Record<string, unknown> = {};

  /**
   * Write data into an agent's isolated memory.
   */
  write(agentId: string, key: string, value: unknown): void {
    const mem = this.memories.get(agentId) ?? {};
    mem[key] = value;
    this.memories.set(agentId, mem);
  }

  /**
   * Read from an agent's isolated memory.
   */
  read(agentId: string): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...(this.memories.get(agentId) ?? {}) });
  }

  /**
   * Read a specific key from an agent's memory.
   */
  readKey(agentId: string, key: string): unknown {
    return this.memories.get(agentId)?.[key];
  }

  /**
   * Get the shared read-only context (derived from EventStore/system state).
   */
  getSharedContext(): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...this.sharedContext });
  }

  /**
   * Update shared context (called by system, not by agents).
   */
  updateSharedContext(updates: Record<string, unknown>): void {
    this.sharedContext = { ...this.sharedContext, ...updates };
  }

  /**
   * Create a snapshot of an agent's memory state.
   */
  snapshot(agentId: string): AgentMemorySnapshot {
    const data = { ...(this.memories.get(agentId) ?? {}) };
    const snap: AgentMemorySnapshot = {
      agentId,
      snapshotId: `mem-snap-${agentId}-${Date.now()}`,
      data,
      timestamp: new Date(),
    };

    const existing = this.snapshots.get(agentId) ?? [];
    existing.push(snap);
    this.snapshots.set(agentId, existing);

    return snap;
  }

  /**
   * Restore an agent's memory from a snapshot.
   */
  restore(snapshot: AgentMemorySnapshot): void {
    this.memories.set(snapshot.agentId, { ...snapshot.data });
  }

  /**
   * Get all snapshots for an agent.
   */
  getSnapshots(agentId: string): ReadonlyArray<AgentMemorySnapshot> {
    return this.snapshots.get(agentId) ?? [];
  }

  /**
   * Clear an agent's memory (reset).
   */
  clear(agentId: string): void {
    this.memories.delete(agentId);
  }

  /**
   * Check if an agent has any stored memory.
   */
  hasMemory(agentId: string): boolean {
    const mem = this.memories.get(agentId);
    return mem !== undefined && Object.keys(mem).length > 0;
  }
}
