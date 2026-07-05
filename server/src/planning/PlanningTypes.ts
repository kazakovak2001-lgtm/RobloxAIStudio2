/**
 * PlanningTypes.ts — All type definitions for the Autonomous Planning Layer (v0.8).
 */

export type PlanStepStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked";
export type PlanStatus =
  | "created"
  | "running"
  | "completed"
  | "failed"
  | "replanned";
export type StepKind = "mandatory" | "optional" | "conditional" | "terminal";

export interface PlanStepDefinition {
  /** Unique step identifier (matches agent type / stepId) */
  id: string;
  /** Agent to execute */
  agent: string;
  /** Step classification */
  kind: StepKind;
  /** Steps that must complete before this one can run */
  dependencies: string[];
  /** Steps that can run in parallel with this one (same dependency tier) */
  parallelGroup?: string;
  /** Whether this step can be retried on failure */
  retryable: boolean;
  /** Max retry count (defaults to 1) */
  maxRetries?: number;
  /** Priority: lower = runs earlier when multiple steps are ready */
  priority: number;
  /** Condition function key — if set, step only runs when condition is met */
  condition?: string;
}

export interface PlanStep extends PlanStepDefinition {
  status: PlanStepStatus;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  qualityScore?: number;
  error?: string;
  /** Whether this step was added during replanning */
  addedDuringReplan?: boolean;
}

export interface ExecutionPlan {
  planId: string;
  executionId: string;
  goal: string;
  priority: number;
  status: PlanStatus;
  currentStep: string | null;
  remainingSteps: string[];
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  parallelGroups: Record<string, string[]>;
  dependencies: Record<string, string[]>;
  steps: Map<string, PlanStep>;
  createdAt: Date;
  updatedAt: Date;
  replanCount: number;
}

export interface PlanningMetrics {
  planId: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalDurationMs: number;
  stepDurations: Record<string, number>;
  criticalPathMs: number;
  parallelOpportunities: number;
  replanCount: number;
  successRatio: number;
  waitingTimeMs: number;
}

export type ReplanReason =
  | "evaluation_failed"
  | "step_skipped"
  | "agent_unavailable"
  | "retry_exceeded"
  | "context_changed";

export interface ReplanEvent {
  reason: ReplanReason;
  failedStep: string;
  preservedSteps: string[];
  newPlan: string[];
  timestamp: Date;
}
