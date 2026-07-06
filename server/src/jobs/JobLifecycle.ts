/**
 * JobLifecycle.ts
 *
 * Manages job state transitions and emits lifecycle events.
 * Integrates with JobStateMachine for deterministic transitions.
 */

import type { Job, JobState, JobEvent, JobEventType } from "./types";
import { TERMINAL_STATES } from "./types";
import { JobStateMachine } from "./JobStateMachine";

export type JobEventListener = (event: JobEvent) => void;

export class JobLifecycle {
  private stateMachine: JobStateMachine;
  private listeners: JobEventListener[] = [];

  constructor() {
    this.stateMachine = new JobStateMachine();
  }

  /**
   * Transition a job to a new state.
   */
  transition(job: Job, to: JobState, data?: Record<string, unknown>): void {
    const from = job.state;
    job.state = this.stateMachine.transition(from, to);

    // Update timing
    if (to !== "QUEUED" && !job.startedAt) {
      job.startedAt = Date.now();
    }
    if (TERMINAL_STATES.has(to)) {
      job.completedAt = Date.now();
    }

    // Update context
    if (from !== "QUEUED" && from !== "FAILED" && from !== "TIMEOUT") {
      if (!job.context.completedStages.includes(from)) {
        job.context.completedStages.push(from);
      }
      job.context.timings[from] = Date.now() - (job.startedAt ?? job.createdAt);
    }
    job.context.activeStage = TERMINAL_STATES.has(to) ? null : to;

    // Emit event
    const eventType = this.mapStateToEvent(to, from);
    if (eventType) {
      this.emit({
        eventType,
        jobId: job.jobId,
        timestamp: Date.now(),
        data: { from, to, ...data },
      });
    }
  }

  /**
   * Subscribe to job events.
   */
  on(listener: JobEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a listener.
   */
  off(listener: JobEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Check if a transition is possible.
   */
  canTransition(job: Job, to: JobState): boolean {
    return this.stateMachine.canTransition(job.state, to);
  }

  /**
   * Check if a job is retryable.
   */
  isRetryable(job: Job): boolean {
    return (
      this.stateMachine.isRetryable(job.state) &&
      job.retryCount < job.maxRetries
    );
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private emit(event: JobEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* listener errors must not break lifecycle */
      }
    }
  }

  private mapStateToEvent(to: JobState, _from: JobState): JobEventType | null {
    switch (to) {
      case "VALIDATING":
        return "JobStarted";
      case "COMPLETED":
        return "JobCompleted";
      case "FAILED":
        return "JobFailed";
      case "CANCELLED":
        return "JobCancelled";
      case "TIMEOUT":
        return "JobTimeout";
      default:
        return "StageCompleted";
    }
  }
}
