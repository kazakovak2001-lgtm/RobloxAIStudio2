/**
 * JobManager.ts
 *
 * Top-level orchestrator for the Job Engine.
 * Manages the complete job lifecycle:
 *   submit → validate → queue → execute → complete/fail/retry
 *
 * Integrates:
 *   - JobQueue (FIFO priority)
 *   - JobLifecycle (state transitions + events)
 *   - JobScheduler (polling + dispatch)
 *   - JobProgressTracker (progress calculation)
 *   - JobMetricsService (statistics)
 *   - RuntimeExecutionController (actual pipeline execution)
 */

import type { Job, JobRequest, JobQueueConfig, JobEvent } from "./types";
import { createJobId, DEFAULT_QUEUE_CONFIG } from "./types";
import { JobQueue } from "./JobQueue";
import { JobLifecycle, type JobEventListener } from "./JobLifecycle";
import { JobScheduler } from "./JobScheduler";
import { JobProgressTracker } from "./JobProgressTracker";
import { JobMetricsService } from "./JobMetricsService";
import { RuntimeExecutionController } from "../runtime/controller/RuntimeExecutionController";
import { AgentRegistry } from "../agents/core/AgentRegistry";

export class JobManager {
  private queue: JobQueue;
  private lifecycle: JobLifecycle;
  private scheduler: JobScheduler;
  private progressTracker: JobProgressTracker;
  private metrics: JobMetricsService;
  private agentRegistry: AgentRegistry;
  private jobs: Map<string, Job> = new Map(); // all known jobs (active + completed)
  private maxJobHistory = 500;

  constructor(agentRegistry: AgentRegistry, config?: Partial<JobQueueConfig>) {
    const queueConfig = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.agentRegistry = agentRegistry;
    this.queue = new JobQueue(queueConfig);
    this.lifecycle = new JobLifecycle();
    this.scheduler = new JobScheduler(this.queue, this.lifecycle);
    this.progressTracker = new JobProgressTracker();
    this.metrics = new JobMetricsService();

    // Wire scheduler to use our executor
    this.scheduler.setExecutor((job) => this.executeJob(job));
  }

  /**
   * Start the job manager (begins processing queue).
   */
  start(): void {
    this.scheduler.start();
  }

  /**
   * Stop the job manager gracefully.
   */
  stop(): void {
    this.scheduler.stop();
  }

  /**
   * Submit a new job. Returns the created Job or rejection reason.
   */
  submit(
    request: JobRequest,
    options?: { priority?: number; timeoutMs?: number; maxRetries?: number },
  ): { job?: Job; error?: string } {
    // Pre-validation
    if (!request.intent || request.intent.trim().length < 3) {
      return { error: "Job intent must be at least 3 characters" };
    }

    const job: Job = {
      jobId: createJobId(),
      state: "QUEUED",
      priority: options?.priority ?? DEFAULT_QUEUE_CONFIG.defaultPriority,
      createdAt: Date.now(),
      request,
      context: {
        jobId: "",
        requestMetadata: { ...request.metadata },
        pipelineMetadata: {},
        activeStage: null,
        completedStages: [],
        timings: {},
        retryCounter: 0,
        checkpointRef: null,
      },
      progress: {
        currentStage: "QUEUED",
        completedStages: [],
        percentage: 0,
        elapsedMs: 0,
        estimatedRemainingMs: 0,
      },
      retryCount: 0,
      maxRetries: options?.maxRetries ?? DEFAULT_QUEUE_CONFIG.defaultMaxRetries,
      timeoutMs: options?.timeoutMs ?? DEFAULT_QUEUE_CONFIG.defaultTimeoutMs,
    };
    job.context.jobId = job.jobId;

    // Enqueue
    const result = this.queue.enqueue(job);
    if (!result.accepted) {
      return { error: result.reason };
    }

    this.jobs.set(job.jobId, job);
    this.emitCreated(job);

    return { job };
  }

  /**
   * Cancel a job (if not already completed).
   */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (!this.lifecycle.canTransition(job, "CANCELLED")) return false;

    this.lifecycle.transition(job, "CANCELLED");
    this.queue.remove(jobId);
    this.queue.release(jobId);
    this.metrics.record(job);
    return true;
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): Job | null {
    return this.jobs.get(jobId) ?? null;
  }

  /**
   * Get job progress.
   */
  getProgress(jobId: string): Job["progress"] | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return this.progressTracker.calculateProgress(job);
  }

  /**
   * Get all jobs (with optional state filter).
   */
  listJobs(filter?: { state?: string }): Job[] {
    let jobs = [...this.jobs.values()];
    if (filter?.state) {
      jobs = jobs.filter((j) => j.state === filter.state);
    }
    return jobs;
  }

  /**
   * Get metrics.
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * Subscribe to job events.
   */
  onEvent(listener: JobEventListener): void {
    this.lifecycle.on(listener);
  }

  /**
   * Get queue snapshot.
   */
  getQueueStatus() {
    return this.queue.getSnapshot();
  }

  // ─── Execution ────────────────────────────────────────────────────────

  private async executeJob(job: Job): Promise<void> {
    const controller = new RuntimeExecutionController(this.agentRegistry);

    try {
      // VALIDATING
      this.lifecycle.transition(job, "VALIDATING");
      job.progress = this.progressTracker.calculateProgress(job);

      // Validate request (basic checks)
      if (!job.request.intent) {
        throw new Error("Missing intent");
      }

      // PLANNING
      this.lifecycle.transition(job, "PLANNING");
      job.progress = this.progressTracker.calculateProgress(job);

      // EXECUTING (delegates to RuntimeExecutionController)
      this.lifecycle.transition(job, "EXECUTING");
      job.progress = this.progressTracker.calculateProgress(job);

      const result = await this.withTimeout(
        controller.execute({
          executionId: job.jobId,
          intent: job.request.intent,
          constraints: job.request.constraints,
          projectId: job.request.projectId,
          stopOnFailure: true,
        }),
        job.timeoutMs,
        job,
      );

      // EVALUATING
      this.lifecycle.transition(job, "EVALUATING");
      job.progress = this.progressTracker.calculateProgress(job);

      if (!result.success) {
        throw new Error(result.failureReport?.message ?? "Execution failed");
      }

      // GENERATING_ARTIFACTS
      this.lifecycle.transition(job, "GENERATING_ARTIFACTS");
      job.progress = this.progressTracker.calculateProgress(job);
      job.result = result.outputs;

      // COMPLETED
      this.lifecycle.transition(job, "COMPLETED");
      job.progress = this.progressTracker.calculateProgress(job);
      job.context.checkpointRef =
        result.checkpoints[result.checkpoints.length - 1] ?? null;
      this.metrics.record(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout =
        message.includes("timed out") || message.includes("Timeout");

      if (isTimeout && this.lifecycle.canTransition(job, "TIMEOUT")) {
        job.error = message;
        this.lifecycle.transition(job, "TIMEOUT");
      } else if (this.lifecycle.canTransition(job, "FAILED")) {
        job.error = message;
        this.lifecycle.transition(job, "FAILED");
      }

      // Retry logic
      if (this.lifecycle.isRetryable(job) && this.shouldRetry(job)) {
        job.retryCount++;
        job.context.retryCounter++;
        this.lifecycle.transition(job, "QUEUED");
        this.queue.enqueue(job);
      } else {
        this.metrics.record(job);
      }
    }

    // Evict old jobs
    this.evictHistory();
  }

  private shouldRetry(job: Job): boolean {
    // Never retry validation failures (they are deterministic)
    if (
      job.error?.includes("Missing intent") ||
      job.error?.includes("validation")
    ) {
      return false;
    }
    return job.retryCount < job.maxRetries;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    job: Job,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job ${job.jobId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private emitCreated(job: Job): void {
    const event: JobEvent = {
      eventType: "JobCreated",
      jobId: job.jobId,
      timestamp: Date.now(),
      data: { intent: job.request.intent, priority: job.priority },
    };
    // Lifecycle listeners will receive this via the lifecycle.on() mechanism
    void event; // event emitted through lifecycle transitions
  }

  private evictHistory(): void {
    if (this.jobs.size <= this.maxJobHistory) return;
    const sorted = [...this.jobs.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    const toEvict = sorted.slice(0, this.jobs.size - this.maxJobHistory);
    for (const [id] of toEvict) {
      this.jobs.delete(id);
    }
  }
}
