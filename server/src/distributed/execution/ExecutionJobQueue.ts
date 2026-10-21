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
  | "queued"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "dead-letter";

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

type HeapEntry = {
  priority: number;
  sequence: number;
  job: ExecutionJob;
};

class PriorityQueue {
  private heap: HeapEntry[] = [];
  private sequence = 0;

  push(job: ExecutionJob): void {
    this.heap.push({
      priority: job.priority,
      sequence: this.sequence++,
      job,
    });
    this.heapifyUp(this.heap.length - 1);
  }

  pop(): ExecutionJob | null {
    if (this.heap.length === 0) return null;

    const root = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.heapifyDown(0);
    }

    return root.job;
  }

  get size(): number {
    return this.heap.length;
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (!this.shouldSwap(this.heap[index], this.heap[parentIndex])) {
        break;
      }
      [this.heap[parentIndex], this.heap[index]] = [
        this.heap[index],
        this.heap[parentIndex],
      ];
      index = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    let current = index;

    while (true) {
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      let best = current;

      if (
        left < this.heap.length &&
        this.shouldSwap(this.heap[left], this.heap[best])
      ) {
        best = left;
      }

      if (
        right < this.heap.length &&
        this.shouldSwap(this.heap[right], this.heap[best])
      ) {
        best = right;
      }

      if (best === current) break;

      [this.heap[current], this.heap[best]] = [
        this.heap[best],
        this.heap[current],
      ];
      current = best;
    }
  }

  private shouldSwap(a: HeapEntry, b: HeapEntry): boolean {
    if (a.priority !== b.priority) {
      return a.priority < b.priority;
    }
    return a.sequence < b.sequence;
  }
}

export class ExecutionJobQueue {
  private queue = new PriorityQueue();
  private queuedJobs: Map<string, ExecutionJob> = new Map();
  private active: Map<string, ExecutionJob> = new Map();
  private completed: Map<string, ExecutionJob> = new Map();
  private deadLetter: DeadLetterEntry[] = [];
  private deadLetterMap: Map<string, DeadLetterEntry> = new Map();
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
      timeoutMs: params.timeoutMs ?? 300_000,
      metadata: params.metadata,
    };

    this.queue.push(job);
    this.queuedJobs.set(job.jobId, job);

    this.totalEnqueued++;
    return job;
  }

  /**
   * Dequeue next available job for a worker.
   */
  dequeue(workerId: string): ExecutionJob | null {
    const job = this.queue.pop();
    if (!job) return null;

    this.queuedJobs.delete(job.jobId);

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
      job.status = "queued";
      job.error = reason;
      job.assignedWorker = undefined;
      job.assignedAt = undefined;
      job.startedAt = undefined;

      this.queue.push(job);
      this.queuedJobs.set(job.jobId, job);
    } else {
      job.status = "dead-letter";
      job.completedAt = Date.now();
      job.error = reason;

      const entry: DeadLetterEntry = {
        job,
        reason,
        deadAt: Date.now(),
      };

      this.deadLetter.push(entry);
      this.deadLetterMap.set(job.jobId, entry);
    }
  }

  /**
   * Get job by ID from any state.
   */
  getJob(jobId: string): ExecutionJob | null {
    return (
      this.active.get(jobId) ??
      this.completed.get(jobId) ??
      this.queuedJobs.get(jobId) ??
      this.deadLetterMap.get(jobId)?.job ??
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
    const entry = this.deadLetterMap.get(jobId);
    if (!entry) return false;

    this.deadLetter = this.deadLetter.filter((item) => item.job.jobId !== jobId);
    this.deadLetterMap.delete(jobId);

    const job = entry.job;
    job.attempts = 0;
    job.status = "queued";
    job.error = undefined;
    job.assignedWorker = undefined;
    job.assignedAt = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;

    this.queue.push(job);
    this.queuedJobs.set(job.jobId, job);
    return true;
  }

  /**
   * Get queue metrics.
   */
  getMetrics(): QueueMetrics {
    return {
      queueDepth: this.queue.size,
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
    return this.queue.size;
  }

  get activeCount(): number {
    return this.active.size;
  }
}
