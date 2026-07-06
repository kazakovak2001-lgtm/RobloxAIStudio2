/**
 * JobMetricsService.ts
 *
 * Collects and computes job execution metrics.
 * Export as JSON for monitoring and analytics.
 */

import type { Job, JobMetrics } from "./types";
import { TERMINAL_STATES } from "./types";

export class JobMetricsService {
  private completedJobs: Job[] = [];
  private maxHistory = 1000;

  /**
   * Record a completed job for metrics.
   */
  record(job: Job): void {
    if (!TERMINAL_STATES.has(job.state)) return;
    this.completedJobs.push(job);
    if (this.completedJobs.length > this.maxHistory) {
      this.completedJobs.shift();
    }
  }

  /**
   * Compute current metrics.
   */
  getMetrics(): JobMetrics {
    const total = this.completedJobs.length;
    if (total === 0) {
      return this.emptyMetrics();
    }

    const succeeded = this.completedJobs.filter((j) => j.state === "COMPLETED");
    const failed = this.completedJobs.filter((j) => j.state === "FAILED");
    const timedOut = this.completedJobs.filter((j) => j.state === "TIMEOUT");
    const cancelled = this.completedJobs.filter((j) => j.state === "CANCELLED");

    // Average execution time (only completed jobs)
    const executionTimes = succeeded
      .filter((j) => j.startedAt && j.completedAt)
      .map((j) => j.completedAt! - j.startedAt!);
    const avgExecTime =
      executionTimes.length > 0
        ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        : 0;

    // Average queue wait time
    const queueWaits = this.completedJobs
      .filter((j) => j.startedAt)
      .map((j) => j.startedAt! - j.createdAt);
    const avgQueueWait =
      queueWaits.length > 0
        ? queueWaits.reduce((a, b) => a + b, 0) / queueWaits.length
        : 0;

    // Stage durations (average across all completed)
    const stageDurations: Record<string, number[]> = {};
    for (const job of succeeded) {
      for (const [stage, ms] of Object.entries(job.context.timings)) {
        if (!stageDurations[stage]) stageDurations[stage] = [];
        stageDurations[stage].push(ms);
      }
    }
    const avgStageDurations: Record<string, number> = {};
    for (const [stage, times] of Object.entries(stageDurations)) {
      avgStageDurations[stage] = Math.round(
        times.reduce((a, b) => a + b, 0) / times.length,
      );
    }

    return {
      averageExecutionTimeMs: Math.round(avgExecTime),
      averageQueueWaitMs: Math.round(avgQueueWait),
      successRate: succeeded.length / total,
      failureRate: failed.length / total,
      timeoutRate: timedOut.length / total,
      cancellationRate: cancelled.length / total,
      stageDurations: avgStageDurations,
      totalJobsProcessed: succeeded.length,
      totalJobsFailed: failed.length,
      totalJobsCancelled: cancelled.length,
      totalJobsTimedOut: timedOut.length,
    };
  }

  /**
   * Export metrics as JSON string.
   */
  exportJson(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  /**
   * Get total recorded jobs.
   */
  get totalRecorded(): number {
    return this.completedJobs.length;
  }

  private emptyMetrics(): JobMetrics {
    return {
      averageExecutionTimeMs: 0,
      averageQueueWaitMs: 0,
      successRate: 0,
      failureRate: 0,
      timeoutRate: 0,
      cancellationRate: 0,
      stageDurations: {},
      totalJobsProcessed: 0,
      totalJobsFailed: 0,
      totalJobsCancelled: 0,
      totalJobsTimedOut: 0,
    };
  }
}
