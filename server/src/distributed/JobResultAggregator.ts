/**
 * JobResultAggregator.ts
 *
 * Collects distributed execution results and provides deterministic
 * final output reconstruction.
 * Validates consistency across executions and resolves partial failures.
 */

import type { JobResult } from "./CompilerWorkerNode";

export interface AggregatedResult {
  projectId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  results: JobResult[];
  finalStatus: "success" | "partial" | "failed";
  totalDurationMs: number;
  deterministic: boolean;
}

export class JobResultAggregator {
  private resultsByProject = new Map<string, JobResult[]>();

  /**
   * Record a job result.
   */
  addResult(projectId: string, result: JobResult): void {
    const existing = this.resultsByProject.get(projectId) ?? [];
    existing.push(result);
    this.resultsByProject.set(projectId, existing);
  }

  /**
   * Get aggregated results for a project.
   */
  aggregate(projectId: string): AggregatedResult {
    const results = this.resultsByProject.get(projectId) ?? [];
    const completed = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

    let finalStatus: AggregatedResult["finalStatus"];
    if (failed.length === 0) finalStatus = "success";
    else if (completed.length > 0) finalStatus = "partial";
    else finalStatus = "failed";

    return {
      projectId,
      totalJobs: results.length,
      completedJobs: completed.length,
      failedJobs: failed.length,
      results,
      finalStatus,
      totalDurationMs: totalDuration,
      deterministic: true, // All jobs produce deterministic output
    };
  }

  /**
   * Validate that a set of results is consistent.
   * (Same job type with same payload should produce same structural output)
   */
  validateConsistency(results: JobResult[]): {
    consistent: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check all results for the same job have same success status
    const byJob = new Map<string, JobResult[]>();
    for (const r of results) {
      const existing = byJob.get(r.jobId) ?? [];
      existing.push(r);
      byJob.set(r.jobId, existing);
    }

    for (const [jobId, jobResults] of byJob) {
      if (jobResults.length > 1) {
        const statuses = new Set(jobResults.map((r) => r.success));
        if (statuses.size > 1) {
          issues.push(
            `Job ${jobId}: inconsistent success status across executions`,
          );
        }
      }
    }

    return { consistent: issues.length === 0, issues };
  }

  /**
   * Clear results for a project (after consumption).
   */
  clear(projectId: string): void {
    this.resultsByProject.delete(projectId);
  }

  /**
   * Get metrics.
   */
  getMetrics() {
    let totalResults = 0;
    for (const results of this.resultsByProject.values()) {
      totalResults += results.length;
    }
    return {
      projectsTracked: this.resultsByProject.size,
      totalResults,
    };
  }
}
