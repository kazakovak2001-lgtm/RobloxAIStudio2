/**
 * ContextResolver.ts — Assembles execution context from memory + knowledge.
 */

import { KnowledgeMemoryManager } from "./MemoryManager";
import { KnowledgeRepository } from "./KnowledgeRepository";
import { ArtifactIndex } from "./ArtifactIndex";
import type { ContextWindow, KnowledgeCategory } from "./types";

export interface ContextQuery {
  projectId: string;
  categories?: KnowledgeCategory[];
  tags?: string[];
  maxEntries?: number;
  maxSizeBytes?: number;
}
export interface BuiltContext {
  query: ContextQuery;
  window: ContextWindow;
  valid: boolean;
  errors: string[];
}

export class ContextResolver {
  private maxSize = 100_000; // 100KB default

  constructor(
    private manager: KnowledgeMemoryManager,
    repo: KnowledgeRepository,
    private artifacts: ArtifactIndex,
  ) {
    // repo reserved for future knowledge-enhanced retrieval (vector search)
    void repo;
  }

  resolve(query: ContextQuery): BuiltContext {
    const maxSize = query.maxSizeBytes ?? this.maxSize;
    const maxEntries = query.maxEntries ?? 100;

    let entries = this.manager.getProjectEntries(query.projectId);

    // Filter by category
    if (query.categories && query.categories.length > 0) {
      entries = entries.filter((e) => query.categories!.includes(e.category));
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      const tagSet = new Set(query.tags);
      entries = entries.filter((e) => e.tags.some((t) => tagSet.has(t)));
    }

    // Sort by recency, limit
    entries = entries
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, maxEntries);

    // Get project artifacts
    const projectArtifacts = this.artifacts
      .getByProject(query.projectId)
      .slice(0, 50);

    // Estimate size + enforce limit
    let totalSize = 0;
    const limitedEntries = entries.filter((e) => {
      const size = JSON.stringify(e.value).length * 2;
      if (totalSize + size > maxSize) return false;
      totalSize += size;
      return true;
    });
    const artifactSize = projectArtifacts.reduce((sum, a) => sum + a.size, 0);

    const window: ContextWindow = {
      entries: limitedEntries,
      artifacts: projectArtifacts,
      totalSize: totalSize + artifactSize,
      maxSize,
    };

    const errors: string[] = [];
    if (limitedEntries.length === 0 && entries.length > 0)
      errors.push("All entries exceeded size limit");

    return { query, window, valid: errors.length === 0, errors };
  }
}
