/**
 * MemoryMetrics.ts — Collects memory system metrics.
 */

import type { MemoryMetricsData } from "./types";
import { KnowledgeMemoryManager } from "./MemoryManager";
import { KnowledgeRepository } from "./KnowledgeRepository";
import { ArtifactIndex } from "./ArtifactIndex";

export class MemoryMetrics {
  private retrievalCount = 0;
  private retrievalSuccesses = 0;
  private totalLatencyMs = 0;
  private cacheHits = 0;
  private cacheTotal = 0;

  recordRetrieval(success: boolean, latencyMs: number): void {
    this.retrievalCount++;
    this.totalLatencyMs += latencyMs;
    if (success) this.retrievalSuccesses++;
  }

  recordCacheAccess(hit: boolean): void {
    this.cacheTotal++;
    if (hit) this.cacheHits++;
  }

  getMetrics(
    manager: KnowledgeMemoryManager,
    repo: KnowledgeRepository,
    index: ArtifactIndex,
  ): MemoryMetricsData {
    return {
      storedEntries: manager.entryCount,
      indexedArtifacts: index.size,
      knowledgeDocuments: repo.size,
      retrievalLatencyMs:
        this.retrievalCount > 0
          ? Math.round(this.totalLatencyMs / this.retrievalCount)
          : 0,
      storageSizeEstimate: (manager.entryCount + index.size + repo.size) * 500, // rough estimate
      cacheHitRatio: this.cacheTotal > 0 ? this.cacheHits / this.cacheTotal : 0,
      retrievalSuccessRate:
        this.retrievalCount > 0
          ? this.retrievalSuccesses / this.retrievalCount
          : 0,
    };
  }

  exportJson(
    manager: KnowledgeMemoryManager,
    repo: KnowledgeRepository,
    index: ArtifactIndex,
  ): string {
    return JSON.stringify(this.getMetrics(manager, repo, index), null, 2);
  }
}
