/**
 * JobProgressTracker.ts
 *
 * Tracks progress for each job through the pipeline stages.
 * Calculates percentage, elapsed time, and estimated remaining time.
 */

import type { Job, JobProgress, JobState } from "./types";
import { ACTIVE_STATES } from "./types";

const STAGE_ORDER: JobState[] = [
  "VALIDATING",
  "PLANNING",
  "EXECUTING",
  "EVALUATING",
  "GENERATING_ARTIFACTS",
];
const STAGE_WEIGHTS: Record<string, number> = {
  VALIDATING: 5,
  PLANNING: 10,
  EXECUTING: 50,
  EVALUATING: 20,
  GENERATING_ARTIFACTS: 15,
};

export class JobProgressTracker {
  /**
   * Calculate current progress for a job.
   */
  calculateProgress(job: Job): JobProgress {
    const elapsed = job.startedAt ? Date.now() - job.startedAt : 0;
    const completedStages = job.context.completedStages;
    const currentStage = job.context.activeStage ?? "QUEUED";

    // Calculate percentage based on stage weights
    let percentage = 0;
    for (const stage of completedStages) {
      percentage += STAGE_WEIGHTS[stage] ?? 0;
    }

    // Add partial progress for current active stage (assume 50% through)
    if (ACTIVE_STATES.has(currentStage as JobState)) {
      percentage += (STAGE_WEIGHTS[currentStage] ?? 0) * 0.5;
    }

    // Terminal states
    if (job.state === "COMPLETED") percentage = 100;
    if (
      job.state === "FAILED" ||
      job.state === "CANCELLED" ||
      job.state === "TIMEOUT"
    ) {
      // Keep percentage as-is to show where it stopped
    }

    // Estimate remaining time
    const completedWeight = completedStages.reduce(
      (sum, s) => sum + (STAGE_WEIGHTS[s] ?? 0),
      0,
    );
    const remainingWeight = 100 - completedWeight;
    const avgTimePerWeight =
      completedWeight > 0 ? elapsed / completedWeight : 0;
    const estimatedRemainingMs = Math.round(avgTimePerWeight * remainingWeight);

    return {
      currentStage,
      completedStages,
      percentage: Math.min(100, Math.round(percentage)),
      elapsedMs: elapsed,
      estimatedRemainingMs:
        job.state === "COMPLETED" ? 0 : estimatedRemainingMs,
    };
  }

  /**
   * Get the next expected stage.
   */
  getNextStage(currentStage: string): string | null {
    const idx = STAGE_ORDER.indexOf(currentStage as JobState);
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
  }

  /**
   * Check if a job has passed a specific stage.
   */
  hasPassedStage(job: Job, stage: string): boolean {
    return job.context.completedStages.includes(stage);
  }
}
