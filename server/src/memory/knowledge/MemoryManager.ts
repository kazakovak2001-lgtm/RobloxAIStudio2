/**
 * MemoryManager.ts — Central memory management for project knowledge.
 */

import type {
  MemoryEntry,
  KnowledgeCategory,
  MemorySessionData,
} from "./types";
import { createMemoryId } from "./types";

export class KnowledgeMemoryManager {
  private entries: Map<string, MemoryEntry> = new Map();
  private sessions: Map<string, MemorySessionData> = new Map();
  private maxEntries = 5000;

  store(
    projectId: string,
    category: KnowledgeCategory,
    key: string,
    value: unknown,
    source: string,
    tags: string[] = [],
  ): MemoryEntry {
    const existing = this.findByKey(projectId, key);
    if (existing) {
      existing.value = value;
      existing.updatedAt = Date.now();
      existing.version++;
      return existing;
    }
    const entry: MemoryEntry = {
      id: createMemoryId(),
      projectId,
      category,
      key,
      value,
      tags,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source,
    };
    this.entries.set(entry.id, entry);
    this.evictIfNeeded();
    return entry;
  }

  retrieve(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  findByKey(projectId: string, key: string): MemoryEntry | undefined {
    return [...this.entries.values()].find(
      (e) => e.projectId === projectId && e.key === key,
    );
  }

  findByCategory(
    projectId: string,
    category: KnowledgeCategory,
  ): MemoryEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.projectId === projectId && e.category === category,
    );
  }

  findByTags(projectId: string, tags: string[]): MemoryEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.projectId === projectId && tags.some((t) => e.tags.includes(t)),
    );
  }

  getProjectEntries(projectId: string): MemoryEntry[] {
    return [...this.entries.values()].filter((e) => e.projectId === projectId);
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  startSession(projectId: string): MemorySessionData {
    const session: MemorySessionData = {
      sessionId: `msession-${Date.now()}`,
      projectId,
      startedAt: Date.now(),
      entries: [],
      artifacts: [],
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  getSession(sessionId: string): MemorySessionData | undefined {
    return this.sessions.get(sessionId);
  }

  get entryCount(): number {
    return this.entries.size;
  }
  get sessionCount(): number {
    return this.sessions.size;
  }

  clear(projectId?: string): void {
    if (projectId) {
      for (const [id, e] of this.entries) {
        if (e.projectId === projectId) this.entries.delete(id);
      }
    } else {
      this.entries.clear();
    }
  }

  private evictIfNeeded(): void {
    if (this.entries.size <= this.maxEntries) return;
    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt,
    );
    const toRemove = sorted.slice(0, this.entries.size - this.maxEntries);
    for (const [id] of toRemove) this.entries.delete(id);
  }
}
