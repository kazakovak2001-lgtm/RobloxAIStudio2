/**
 * JobQueueManager.ts
 *
 * Central job scheduling system for all compiler executions.
 * In-memory priority queue with FIFO within same priority.
 * Designed for future migration to persistent/distributed queue (Redis, SQS, etc.).
 */

export type JobType = "BUILD" | "REPLAY" | "DIFF" | "IMPACT" | "CI";
export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "retrying";

export interface CompilerJob {
  jobId: string;
  projectId: string;
  type: JobType;
  payload: unknown;
  priority: number; // lower = higher priority
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  assignedWorker?: string;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: unknown;
}

export interface JobStatus2 {
  jobId: string;
  status: JobStatus;
  progress?: number;
  assignedWorker?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export class JobQueueManager {
  private queue: CompilerJob[] = [];
  private active = new Map<string, CompilerJob>();
  private completed = new Map<string, CompilerJob>();
  private jobCounter = 0;

  /**
   * Enqueue a new job. Returns the jobId.
   */
  enqueue(
    projectId: string,
    type: JobType,
    payload: unknown,
    priority = 5,
    maxAttempts = 3,
  ): string {
    this.jobCounter++;
    const jobId = `job-${Date.now()}-${this.jobCounter}`;

    const job: CompilerJob = {
      jobId,
      projectId,
      type,
      payload,
      priority,
      status: "queued",
      createdAt: new Date(),
      attempts: 0,
      maxAttempts,
    };

    // Insert sorted by priority (lower first)
    const idx = this.queue.findIndex((j) => j.priority > priority);
    if (idx === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(idx, 0, job);
    }

    console.log(
      `[QUEUE] Enqueued | Job: ${jobId} | Type: ${type} | Project: ${projectId} | Priority: ${priority}`,
    );
    return jobId;
  }

  /**
   * Dequeue the next available job for a worker.
   * Returns null if queue is empty.
   */
  dequeue(workerId: string): CompilerJob | null {
    if (this.queue.length === 0) return null;

    const job = this.queue.shift()!;
    job.status = "running";
    job.startedAt = new Date();
    job.assignedWorker = workerId;
    job.attempts++;

    this.active.set(job.jobId, job);
    return job;
  }

  /**
   * Acknowledge job completion.
   */
  ack(jobId: string, result?: unknown): void {
    const job = this.active.get(jobId);
    if (!job) return;

    job.status = "completed";
    job.completedAt = new Date();
    job.result = result;

    this.active.delete(jobId);
    this.completed.set(jobId, job);

    console.log(
      `[QUEUE] Completed | Job: ${jobId} | Duration: ${job.completedAt.getTime() - (job.startedAt?.getTime() ?? 0)}ms`,
    );
  }

  /**
   * Mark job as failed. Requeue if attempts < maxAttempts.
   */
  fail(jobId: string, reason: string): void {
    const job = this.active.get(jobId);
    if (!job) return;

    this.active.delete(jobId);

    if (job.attempts < job.maxAttempts) {
      // Requeue for retry
      job.status = "retrying";
      job.error = reason;
      job.assignedWorker = undefined;
      job.startedAt = undefined;
      this.queue.push(job); // Back of queue for retry
      console.log(
        `[QUEUE] Retrying | Job: ${jobId} | Attempt: ${job.attempts}/${job.maxAttempts}`,
      );
    } else {
      job.status = "failed";
      job.completedAt = new Date();
      job.error = reason;
      this.completed.set(jobId, job);
      console.log(`[QUEUE] Failed | Job: ${jobId} | Reason: ${reason}`);
    }
  }

  /**
   * Get job status.
   */
  getStatus(jobId: string): JobStatus2 | null {
    const job =
      this.active.get(jobId) ??
      this.completed.get(jobId) ??
      this.queue.find((j) => j.jobId === jobId);
    if (!job) return null;
    return {
      jobId: job.jobId,
      status: job.status,
      assignedWorker: job.assignedWorker,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
    };
  }

  /**
   * Get full job (including result).
   */
  getJob(jobId: string): CompilerJob | null {
    return (
      this.active.get(jobId) ??
      this.completed.get(jobId) ??
      this.queue.find((j) => j.jobId === jobId) ??
      null
    );
  }

  /** Queue depth. */
  get queueDepth(): number {
    return this.queue.length;
  }
  /** Active (running) jobs. */
  get activeCount(): number {
    return this.active.size;
  }
  /** Completed job count (includes failed). */
  get completedCount(): number {
    return this.completed.size;
  }

  /**
   * Get queue metrics for telemetry.
   */
  getMetrics() {
    return {
      queueDepth: this.queue.length,
      activeJobs: this.active.size,
      completedJobs: this.completed.size,
      totalEnqueued: this.jobCounter,
    };
  }
}

let _instance: JobQueueManager | null = null;
export function getJobQueueManager(): JobQueueManager {
  if (!_instance) _instance = new JobQueueManager();
  return _instance;
}
