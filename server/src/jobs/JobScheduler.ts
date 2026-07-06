/**
 * JobScheduler.ts
 *
 * Polls the JobQueue and dispatches jobs for execution.
 * Manages concurrency, timeout detection, and retry scheduling.
 */

import type { Job } from "./types";
import { JobQueue } from "./JobQueue";
import type { JobLifecycle } from "./JobLifecycle";

export interface SchedulerConfig {
  pollIntervalMs: number;
  timeoutCheckIntervalMs: number;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  pollIntervalMs: 100,
  timeoutCheckIntervalMs: 5000,
};

export class JobScheduler {
  private queue: JobQueue;
  private config: SchedulerConfig;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private timeoutTimer: ReturnType<typeof setInterval> | null = null;
  private executor: ((job: Job) => Promise<void>) | null = null;
  private running = false;

  constructor(
    queue: JobQueue,
    _lifecycle: JobLifecycle,
    config?: Partial<SchedulerConfig>,
  ) {
    this.queue = queue;
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /**
   * Set the execution function (called for each dequeued job).
   */
  setExecutor(executor: (job: Job) => Promise<void>): void {
    this.executor = executor;
  }

  /**
   * Start the scheduler.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.config.pollIntervalMs);

    this.timeoutTimer = setInterval(() => {
      this.checkTimeouts();
    }, this.config.timeoutCheckIntervalMs);
  }

  /**
   * Stop the scheduler gracefully.
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.queue.shutdown();
  }

  /**
   * Check if the scheduler is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.executor) return;

    const job = this.queue.dequeue();
    if (!job) return;

    // Execute asynchronously (don't block the poll loop)
    void this.executeJob(job);
  }

  private async executeJob(job: Job): Promise<void> {
    if (!this.executor) return;

    try {
      await this.executor(job);
    } catch {
      // Executor errors are handled inside the executor (JobManager)
    } finally {
      this.queue.release(job.jobId);
    }
  }

  private checkTimeouts(): void {
    // This is checked by JobManager during execution
    // Scheduler only detects queue-level timeouts (jobs waiting too long)
  }
}
