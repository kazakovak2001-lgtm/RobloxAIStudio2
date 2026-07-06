/**
 * JobQueue.ts
 *
 * FIFO priority queue for generation jobs.
 * Features:
 *   - Configurable concurrency
 *   - Maximum queue size enforcement
 *   - Graceful shutdown support
 *   - Pre-enqueue validation
 */

import type { Job, JobQueueConfig } from "./types";
import { DEFAULT_QUEUE_CONFIG } from "./types";

export class JobQueue {
  private queue: Job[] = [];
  private active: Map<string, Job> = new Map();
  private config: JobQueueConfig;
  private shuttingDown = false;

  constructor(config?: Partial<JobQueueConfig>) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Enqueue a job. Rejects if queue is full or shutting down.
   */
  enqueue(job: Job): { accepted: boolean; reason?: string } {
    if (this.shuttingDown) {
      return { accepted: false, reason: "Queue is shutting down" };
    }
    if (this.queue.length >= this.config.maxQueueSize) {
      return {
        accepted: false,
        reason: `Queue full (max: ${this.config.maxQueueSize})`,
      };
    }

    // Validate job has required fields
    if (!job.jobId || !job.request.intent) {
      return {
        accepted: false,
        reason: "Invalid job: missing jobId or intent",
      };
    }

    // Insert sorted by priority (lower number = higher priority)
    const idx = this.queue.findIndex((j) => j.priority > job.priority);
    if (idx === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(idx, 0, job);
    }

    return { accepted: true };
  }

  /**
   * Dequeue the next available job (if concurrency allows).
   */
  dequeue(): Job | null {
    if (this.shuttingDown) return null;
    if (this.active.size >= this.config.maxConcurrency) return null;
    if (this.queue.length === 0) return null;

    const job = this.queue.shift()!;
    this.active.set(job.jobId, job);
    return job;
  }

  /**
   * Mark a job as no longer active (completed, failed, etc.).
   */
  release(jobId: string): void {
    this.active.delete(jobId);
  }

  /**
   * Remove a job from the queue (before execution starts).
   */
  remove(jobId: string): boolean {
    const idx = this.queue.findIndex((j) => j.jobId === jobId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Get a job by ID from queue or active set.
   */
  get(jobId: string): Job | null {
    const queued = this.queue.find((j) => j.jobId === jobId);
    if (queued) return queued;
    return this.active.get(jobId) ?? null;
  }

  /**
   * Initiate graceful shutdown. No new jobs accepted, wait for active to finish.
   */
  shutdown(): void {
    this.shuttingDown = true;
  }

  /**
   * Check if all active jobs have completed during shutdown.
   */
  isIdle(): boolean {
    return this.active.size === 0;
  }

  get depth(): number {
    return this.queue.length;
  }
  get activeCount(): number {
    return this.active.size;
  }
  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }
  get maxConcurrency(): number {
    return this.config.maxConcurrency;
  }

  /**
   * Get queue snapshot for diagnostics.
   */
  getSnapshot(): {
    queued: number;
    active: number;
    maxConcurrency: number;
    maxSize: number;
    shuttingDown: boolean;
  } {
    return {
      queued: this.queue.length,
      active: this.active.size,
      maxConcurrency: this.config.maxConcurrency,
      maxSize: this.config.maxQueueSize,
      shuttingDown: this.shuttingDown,
    };
  }
}
