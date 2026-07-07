/**
 * MemoryStorage.ts — Persistence layer: save/load/snapshot/restore.
 * Uses JSON serialization. No external database dependency.
 */

import type {
  MemoryEntry,
  ArtifactMetadata,
  KnowledgeDocument,
  MemorySnapshot,
} from "./types";

export class MemoryStorage {
  private snapshots: Map<string, string> = new Map(); // projectId → serialized snapshot

  save(
    projectId: string,
    entries: MemoryEntry[],
    artifacts: ArtifactMetadata[],
    documents: KnowledgeDocument[],
  ): string {
    const snapshot: MemorySnapshot = {
      projectId,
      entries,
      artifacts,
      documents,
      timestamp: Date.now(),
      version: 1,
    };
    const serialized = JSON.stringify(snapshot);
    this.snapshots.set(projectId, serialized);
    return serialized;
  }

  load(projectId: string): MemorySnapshot | null {
    const raw = this.snapshots.get(projectId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MemorySnapshot;
    } catch {
      return null;
    }
  }

  snapshot(
    projectId: string,
    entries: MemoryEntry[],
    artifacts: ArtifactMetadata[],
    documents: KnowledgeDocument[],
  ): MemorySnapshot {
    const snap: MemorySnapshot = {
      projectId,
      entries,
      artifacts,
      documents,
      timestamp: Date.now(),
      version: (this.getVersion(projectId) ?? 0) + 1,
    };
    this.snapshots.set(projectId, JSON.stringify(snap));
    return snap;
  }

  restore(data: string): MemorySnapshot | null {
    try {
      return JSON.parse(data) as MemorySnapshot;
    } catch {
      return null;
    }
  }

  has(projectId: string): boolean {
    return this.snapshots.has(projectId);
  }
  delete(projectId: string): boolean {
    return this.snapshots.delete(projectId);
  }
  listProjects(): string[] {
    return [...this.snapshots.keys()];
  }

  getVersion(projectId: string): number | null {
    const snap = this.load(projectId);
    return snap?.version ?? null;
  }

  get size(): number {
    return this.snapshots.size;
  }
}
