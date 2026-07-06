/**
 * ExecutionJobQueue.ts
 *
 * Priority queue for PlanExecutor execution jobs.
 * Extends the pattern of JobQueueManager but specialized for AI pipeline execution.
 *
 * Features:
 *   - Priority-based ordering
 *   - Dead-letter queue for unrecoverable failures
 *   - Job lifecycle tracking
 *   - Configurable retention
 */

import { randomUUID } from "crypto";

export type ExecutionJobStatus =
  "queued" | "assigned" | "running" | "completed" | "failed" | "dead-letter";

export interface ExecutionJob {
  jobId: string;
  executionId: string;
  projectId?: string;
  intent: string;
  constraints: string[];
  priority: number;
  status: ExecutionJobStatus;
  createdAt: number;
  assignedAt?: number;
  startedAt?: number;
  completedAt?: number;
  assignedWorker?: string;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  error?: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

export interface DeadLetterEntry {
  job: ExecutionJob;
  reason: string;
  deadAt: number;
}

export interface QueueMetrics {
  queueDepth: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  deadLetterCount: number;
  totalEnqueued: number;
  averageWaitMs: number;
  averageExecutionMs: number;
}

export class ExecutionJobQueue {
  private queue: ExecutionJob[] = [];
  private active: Map<string, ExecutionJob> = new Map();
  private completed: Map<string, ExecutionJob> = new Map();
  private deadLetter: DeadLetterEntry[] = [];
  private totalEnqueued = 0;
  private totalWaitMs = 0;
  private totalExecMs = 0;
  private completedCount = 0;

  /**
   * Enqueue a new execution job.
   */
  enqueue(params: {
    intent: string;
    constraints?: string[];
    projectId?: string;
    priority?: number;
    maxAttempts?: number;
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  }): ExecutionJob {
    const job: ExecutionJob = {
      jobId: `exec-job-${randomUUID().slice(0, 8)}`,
      executionId: `exec-${randomUUID().slice(0, 12)}`,
      projectId: params.projectId,
      intent: params.intent,
      constraints: params.constraints ?? [],
      priority: params.priority ?? 5,
      status: "queued",
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      timeoutMs: params.timeoutMs ?? 300_000, // 5 min default
      metadata: params.metadata,
    };

    // Insert sorted by priority (lower = higher priority)
    const idx = this.queue.findIndex((j) => j.priority > job.priority);
    if (idx === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(idx, 0, job);
    }

    this.totalEnqueued++;
    return job;
  }

  /**
   * Dequeue next available job for a worker.
   */
  dequeue(workerId: string): ExecutionJob | null {
    if (this.queue.length === 0) return null;

    const job = this.queue.shift()!;
    job.status = "assigned";
    job.assignedAt = Date.now();
    job.assignedWorker = workerId;
    job.attempts++;

    this.totalWaitMs += job.assignedAt - job.createdAt;
    this.active.set(job.jobId, job);
    return job;
  }

  /**
   * Mark job as started (worker begins execution).
   */
  markRunning(jobId: string): void {
    const job = this.active.get(jobId);
    if (job) {
      job.status = "running";
      job.startedAt = Date.now();
    }
  }

  /**
   * Acknowledge successful completion.
   */
  complete(jobId: string, result: unknown): void {
    const job = this.active.get(jobId);
    if (!job) return;

    job.status = "completed";
    job.completedAt = Date.now();
    job.result = result;

    const execMs =
      job.completedAt - (job.startedAt ?? job.assignedAt ?? job.createdAt);
    this.totalExecMs += execMs;
    this.completedCount++;

    this.active.delete(jobId);
    this.completed.set(jobId, job);
  }

  /**
   * Mark job as failed. Requeue if retries remain, else dead-letter.
   */
  fail(jobId: string, reason: string): void {
    const job = this.active.get(jobId);
    if (!job) return;

    this.active.delete(jobId);

    if (job.attempts < job.maxAttempts) {
      // Requeue for retry (back of same priority level)
      job.status = "queued";
      job.error = reason;
      job.assignedWorker = undefined;
      job.assignedAt = undefined;
      job.startedAt = undefined;

      const idx = this.queue.findIndex((j) => j.priority > job.priority);
      if (idx === -1) {
        this.queue.push(job);
      } else {
        this.queue.splice(idx, 0, job);
      }
    } else {
      // Dead-letter: exhausted all retries
      job.status = "dead-letter";
      job.completedAt = Date.now();
      job.error = reason;

      this.deadLetter.push({ job, reason, deadAt: Date.now() });
    }
  }

  /**
   * Get job by ID from any state.
   */
  getJob(jobId: string): ExecutionJob | null {
    return (
      this.active.get(jobId) ??
      this.completed.get(jobId) ??
      this.queue.find((j) => j.jobId === jobId) ??
      this.deadLetter.find((e) => e.job.jobId === jobId)?.job ??
      null
    );
  }

  /**
   * Get dead-letter queue contents.
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetter];
  }

  /**
   * Retry a dead-letter job (resets attempts, re-enqueues).
   */
  retryDeadLetter(jobId: string): boolean {
    const idx = this.deadLetter.findIndex((e) => e.job.jobId === jobId);
    if (idx === -1) return false;

    const entry = this.deadLetter.splice(idx, 1)[0];
    entry.job.attempts = 0;
    entry.job.status = "queued";
    entry.job.error = undefined;
    entry.job.assignedWorker = undefined;
    entry.job.assignedAt = undefined;
    entry.job.startedAt = undefined;
    entry.job.completedAt = undefined;

    this.queue.push(entry.job);
    return true;
  }

  /**
   * Get queue metrics.
   */
  getMetrics(): QueueMetrics {
    return {
      queueDepth: this.queue.length,
      activeJobs: this.active.size,
      completedJobs: this.completed.size,
      failedJobs: this.deadLetter.length,
      deadLetterCount: this.deadLetter.length,
      totalEnqueued: this.totalEnqueued,
      averageWaitMs:
        this.totalEnqueued > 0 ? this.totalWaitMs / this.totalEnqueued : 0,
      averageExecutionMs:
        this.completedCount > 0 ? this.totalExecMs / this.completedCount : 0,
    };
  }

  get depth(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.active.size;
  }
}
