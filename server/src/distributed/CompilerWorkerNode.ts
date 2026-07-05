/**
 * CompilerWorkerNode.ts
 *
 * Execution unit that pulls jobs from JobQueueManager and processes them
 * using CompilerAPI in isolated project context.
 * Each worker is stateless — all state comes from the job payload.
 */

import type { CompilerJob } from "./JobQueueManager";
import { JobQueueManager, getJobQueueManager } from "./JobQueueManager";
import type { CompilerAPI } from "../compiler/CompilerAPI";
import { CompilerErrorBoundary } from "../compiler/CompilerErrorBoundary";

export type WorkerStatus = "idle" | "processing" | "stopped";

export interface JobResult {
  jobId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  workerId: string;
}

export class CompilerWorkerNode {
  readonly workerId: string;
  private status: WorkerStatus = "idle";
  private queue: JobQueueManager;
  private api: CompilerAPI;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private processedCount = 0;
  private failedCount = 0;

  constructor(workerId: string, api: CompilerAPI, queue?: JobQueueManager) {
    this.workerId = workerId;
    this.api = api;
    this.queue = queue ?? getJobQueueManager();
  }

  /**
   * Start the worker — begins polling the queue.
   */
  startWorker(pollMs = 100): void {
    if (this.pollInterval) return;
    this.status = "idle";
    this.pollInterval = setInterval(() => {
      if (this.status === "idle") {
        void this.pollAndProcess();
      }
    }, pollMs);
    console.log(`[WORKER] Started | ID: ${this.workerId}`);
  }

  /**
   * Stop the worker gracefully.
   */
  stopWorker(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.status = "stopped";
    console.log(
      `[WORKER] Stopped | ID: ${this.workerId} | Processed: ${this.processedCount}`,
    );
  }

  /**
   * Process a single job (can be called directly for synchronous execution).
   */
  async process(job: CompilerJob): Promise<JobResult> {
    const start = Date.now();
    this.status = "processing";

    const result = await CompilerErrorBoundary.safe(
      () => this.executeJob(job),
      `worker:${job.type}`,
    );

    const durationMs = Date.now() - start;

    if (result.success) {
      this.queue.ack(job.jobId, result.data);
      this.processedCount++;
      this.status = "idle";
      return {
        jobId: job.jobId,
        success: true,
        data: result.data,
        durationMs,
        workerId: this.workerId,
      };
    } else {
      this.queue.fail(job.jobId, result.error.message);
      this.failedCount++;
      this.status = "idle";
      return {
        jobId: job.jobId,
        success: false,
        error: result.error.message,
        durationMs,
        workerId: this.workerId,
      };
    }
  }

  getStatus(): WorkerStatus {
    return this.status;
  }
  getProcessedCount(): number {
    return this.processedCount;
  }
  getFailedCount(): number {
    return this.failedCount;
  }

  getMetrics() {
    return {
      workerId: this.workerId,
      status: this.status,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
    };
  }

  private async pollAndProcess(): Promise<void> {
    const job = this.queue.dequeue(this.workerId);
    if (!job) return;
    await this.process(job);
  }

  private async executeJob(job: CompilerJob): Promise<unknown> {
    const { projectId, type, payload } = job;
    const p = payload as Record<string, unknown>;

    switch (type) {
      case "BUILD": {
        const res = await this.api.buildAssembly(projectId, p.blueprint as any);
        if (!res.success) throw new Error(res.error.message);
        return res.data;
      }
      case "REPLAY": {
        const res = await this.api.replayAssembly(
          projectId,
          p.assemblyId as string,
          p.version as string,
          p.blueprint as any,
        );
        if (!res.success) throw new Error(res.error.message);
        return res.data;
      }
      case "DIFF": {
        const res = this.api.diffAssemblies(
          projectId,
          p.assemblyId as string,
          p.fromVersion as string,
          p.toVersion as string,
        );
        if (!res.success) throw new Error(res.error.message);
        return res.data;
      }
      case "IMPACT": {
        const res = this.api.analyzeImpact(
          projectId,
          p.assemblyId as string,
          p.fromVersion as string,
          p.toVersion as string,
        );
        if (!res.success) throw new Error(res.error.message);
        return res.data;
      }
      case "CI": {
        const res = await this.api.runCI(
          projectId,
          p.assemblyId as string,
          p.version as string,
        );
        if (!res.success) throw new Error(res.error.message);
        return res.data;
      }
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }
}
