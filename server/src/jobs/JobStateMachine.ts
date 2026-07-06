/**
 * JobStateMachine.ts
 *
 * Deterministic state machine for job lifecycle.
 * Defines valid transitions and rejects invalid ones.
 */

import type { JobState } from "./types";

const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
  QUEUED: ["VALIDATING", "CANCELLED", "TIMEOUT"],
  VALIDATING: ["PLANNING", "FAILED", "CANCELLED", "TIMEOUT"],
  PLANNING: ["EXECUTING", "FAILED", "CANCELLED", "TIMEOUT"],
  EXECUTING: ["EVALUATING", "FAILED", "CANCELLED", "TIMEOUT"],
  EVALUATING: ["GENERATING_ARTIFACTS", "FAILED", "CANCELLED", "TIMEOUT"],
  GENERATING_ARTIFACTS: ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"],
  COMPLETED: [],
  FAILED: ["QUEUED"], // retry: FAILED → QUEUED
  CANCELLED: [],
  TIMEOUT: ["QUEUED"], // retry: TIMEOUT → QUEUED
};

export class JobStateMachine {
  /**
   * Check if a transition is valid.
   */
  canTransition(from: JobState, to: JobState): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed.includes(to);
  }

  /**
   * Perform a transition. Throws if invalid.
   */
  transition(from: JobState, to: JobState): JobState {
    if (!this.canTransition(from, to)) {
      throw new Error(`Invalid state transition: ${from} → ${to}`);
    }
    return to;
  }

  /**
   * Get allowed next states from current state.
   */
  getNextStates(current: JobState): JobState[] {
    return [...VALID_TRANSITIONS[current]];
  }

  /**
   * Check if a state is terminal (no further transitions possible except retry).
   */
  isTerminal(state: JobState): boolean {
    return state === "COMPLETED" || state === "CANCELLED";
  }

  /**
   * Check if a state is retryable.
   */
  isRetryable(state: JobState): boolean {
    return state === "FAILED" || state === "TIMEOUT";
  }
}
