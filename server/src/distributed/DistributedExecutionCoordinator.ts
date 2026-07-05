/**
 * DistributedExecutionCoordinator.ts
 *
 * Orchestrates job distribution across worker pool.
 * Manages: worker registration, job dispatch, load balancing,
 * health monitoring, and cluster status reporting.
 */

import { CompilerWorkerNode } from "./CompilerWorkerNode";
import {
  JobQueueManager,
  getJobQueueManager,
  type CompilerJob,
} from "./JobQueueManager";
import { WorkerHealthMonitor, type WorkerHealth } from "./WorkerHealthMonitor";
import { JobResultAggregator } from "./JobResultAggregator";
import type { CompilerAPI } from "../compiler/CompilerAPI";

export interface ClusterStatus {
  totalWorkers: number;
  healthyWorkers: number;
  unhealthyWorkers: number;
  queueDepth: number;
  activeJobs: number;
  completedJobs: number;
  workers: WorkerHealth[];
}

export class DistributedExecutionCoordinator {
  private workers = new Map<string, CompilerWorkerNode>();
  private queue: JobQueueManager;
  private healthMonitor: WorkerHealthMonitor;
  private resultAggregator = new JobResultAggregator();
  private workerCounter = 0;

  constructor(
    private readonly api: CompilerAPI,
    queue?: JobQueueManager,
  ) {
    this.queue = queue ?? getJobQueueManager();
    this.healthMonitor = new WorkerHealthMonitor();
  }

  /**
   * Create and register a new worker node.
   */
  registerWorker(): CompilerWorkerNode {
    this.workerCounter++;
    const workerId = `worker-${this.workerCounter}`;
    const worker = new CompilerWorkerNode(workerId, this.api, this.queue);
    this.workers.set(workerId, worker);
    this.healthMonitor.register(worker);
    console.log(
      `[COORDINATOR] Worker registered | ID: ${workerId} | Pool size: ${this.workers.size}`,
    );
    return worker;
  }

  /**
   * Unregister and stop a worker.
   */
  unregisterWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.stopWorker();
      this.workers.delete(workerId);
      this.healthMonitor.unregister(workerId);
    }
  }

  /**
   * Start all registered workers.
   */
  startAll(pollMs = 100): void {
    for (const worker of this.workers.values()) {
      worker.startWorker(pollMs);
    }
    console.log(`[COORDINATOR] All ${this.workers.size} workers started`);
  }

  /**
   * Stop all registered workers.
   */
  stopAll(): void {
    for (const worker of this.workers.values()) {
      worker.stopWorker();
    }
  }

  /**
   * Dispatch a job to the queue (workers will pick it up).
   * Returns the jobId for async result retrieval.
   */
  dispatch(
    projectId: string,
    type: CompilerJob["type"],
    payload: unknown,
    priority = 5,
  ): string {
    return this.queue.enqueue(projectId, type, payload, priority);
  }

  /**
   * Check if rebalancing is needed (dead workers, etc.).
   */
  rebalance(): void {
    const dead = this.healthMonitor.getDeadWorkers();
    if (dead.length > 0) {
      console.log(
        `[COORDINATOR] Rebalancing: ${dead.length} dead workers detected`,
      );
      for (const workerId of dead) {
        this.unregisterWorker(workerId);
        // Optionally spawn replacement
        this.registerWorker().startWorker();
      }
    }
  }

  /**
   * Get overall cluster status.
   */
  getClusterStatus(): ClusterStatus {
    const healthReport = this.healthMonitor.getHealthReport();
    const healthy = healthReport.filter((w) => w.healthy).length;

    return {
      totalWorkers: this.workers.size,
      healthyWorkers: healthy,
      unhealthyWorkers: this.workers.size - healthy,
      queueDepth: this.queue.queueDepth,
      activeJobs: this.queue.activeCount,
      completedJobs: this.queue.completedCount,
      workers: healthReport,
    };
  }

  /**
   * Get the result aggregator for consumption.
   */
  getAggregator(): JobResultAggregator {
    return this.resultAggregator;
  }

  /**
   * Get job result by ID (after completion).
   */
  getJobResult(jobId: string): unknown | null {
    const job = this.queue.getJob(jobId);
    if (!job || job.status !== "completed") return null;
    return job.result;
  }

  /**
   * Get job status.
   */
  getJobStatus(jobId: string) {
    return this.queue.getStatus(jobId);
  }

  get workerCount(): number {
    return this.workers.size;
  }
}
