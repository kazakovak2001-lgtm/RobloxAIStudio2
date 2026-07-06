/**
 * Job Orchestration Engine — shared types.
 */

import { randomUUID } from "crypto";

// ─── Job States ──────────────────────────────────────────────────────────────

export type JobState =
  | "QUEUED"
  | "VALIDATING"
  | "PLANNING"
  | "EXECUTING"
  | "EVALUATING"
  | "GENERATING_ARTIFACTS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export const TERMINAL_STATES: ReadonlySet<JobState> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
]);
export const ACTIVE_STATES: ReadonlySet<JobState> = new Set([
  "VALIDATING",
  "PLANNING",
  "EXECUTING",
  "EVALUATING",
  "GENERATING_ARTIFACTS",
]);

// ─── Job Definition ──────────────────────────────────────────────────────────

export interface Job {
  jobId: string;
  state: JobState;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  request: JobRequest;
  context: ExecutionContext;
  progress: JobProgress;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  error?: string;
  result?: unknown;
}

export interface JobRequest {
  intent: string;
  constraints: string[];
  projectId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Execution Context ───────────────────────────────────────────────────────

export interface ExecutionContext {
  jobId: string;
  requestMetadata: Record<string, unknown>;
  pipelineMetadata: Record<string, unknown>;
  activeStage: string | null;
  completedStages: string[];
  timings: Record<string, number>;
  retryCounter: number;
  checkpointRef: string | null;
}

// ─── Progress ────────────────────────────────────────────────────────────────

export interface JobProgress {
  currentStage: string;
  completedStages: string[];
  percentage: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export type JobEventType =
  | "JobCreated"
  | "JobStarted"
  | "StageCompleted"
  | "ProgressUpdated"
  | "JobCompleted"
  | "JobFailed"
  | "JobCancelled"
  | "JobTimeout";

export interface JobEvent {
  eventType: JobEventType;
  jobId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface JobMetrics {
  averageExecutionTimeMs: number;
  averageQueueWaitMs: number;
  successRate: number;
  failureRate: number;
  timeoutRate: number;
  cancellationRate: number;
  stageDurations: Record<string, number>;
  totalJobsProcessed: number;
  totalJobsFailed: number;
  totalJobsCancelled: number;
  totalJobsTimedOut: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface JobQueueConfig {
  maxConcurrency: number;
  maxQueueSize: number;
  defaultTimeoutMs: number;
  defaultMaxRetries: number;
  defaultPriority: number;
}

export const DEFAULT_QUEUE_CONFIG: JobQueueConfig = {
  maxConcurrency: 2,
  maxQueueSize: 50,
  defaultTimeoutMs: 300_000, // 5 minutes
  defaultMaxRetries: 2,
  defaultPriority: 5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createJobId(): string {
  return `job-${randomUUID().slice(0, 12)}`;
}
