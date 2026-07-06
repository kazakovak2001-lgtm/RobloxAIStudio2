/**
 * StudioSyncMetrics.ts — Collects synchronization metrics.
 */

import type { SyncResult, StudioSyncMetricsData } from "./types";

export class StudioSyncMetrics {
  private results: SyncResult[] = [];
  private maxHistory = 200;

  record(result: SyncResult): void {
    this.results.push(result);
    if (this.results.length > this.maxHistory) this.results.shift();
  }

  getMetrics(): StudioSyncMetricsData {
    const total = this.results.length;
    if (total === 0)
      return {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        averageDurationMs: 0,
        averageItemCount: 0,
        averageSizeBytes: 0,
        lastSyncAt: 0,
        successRate: 0,
      };

    const successful = this.results.filter((r) => r.success);
    const avgDuration =
      this.results.reduce((s, r) => s + r.durationMs, 0) / total;
    const avgItems =
      this.results.reduce((s, r) => s + r.itemsSynced, 0) / total;
    const avgSize = this.results.reduce((s, r) => s + r.totalSize, 0) / total;
    const last = this.results[this.results.length - 1];

    return {
      totalSyncs: total,
      successfulSyncs: successful.length,
      failedSyncs: total - successful.length,
      averageDurationMs: Math.round(avgDuration),
      averageItemCount: Math.round(avgItems),
      averageSizeBytes: Math.round(avgSize),
      lastSyncAt: last?.durationMs ? Date.now() : 0,
      successRate: successful.length / total,
    };
  }

  exportJson(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }
  get totalRecorded(): number {
    return this.results.length;
  }
}
