/**
 * ExecutionCoordinator.ts
 *
 * Orchestrates a pool of ExecutionWorkers for horizontal scaling of
 * PlanExecutor-based AI pipeline execution.
 *
 * Responsibilities:
 *   - Worker pool management (register, start, stop, health)
 *   - Job dispatch (enqueue → workers pick up)
 *   - Load balancing (worker selection, queue pressure monitoring)
 *   - Auto-scaling signals (scale up/down recommendations)
 *   - Fault recovery (dead worker replacement)
 */

import {
  ExecutionWorker,
  type WorkerMetrics,
  type WorkerConfig,
} from "./ExecutionWorker";
import {
  ExecutionJobQueue,
  type ExecutionJob,
  type QueueMetrics,
} from "./ExecutionJobQueue";
import { AgentRegistry } from "../../agents/core/AgentRegistry";

export interface CoordinatorConfig {
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number; // queue depth to trigger scale-up
  scaleDownThreshold: number; // idle workers to trigger scale-down
  healthCheckIntervalMs: number;
  workerConfig?: Partial<WorkerConfig>;
}

const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  minWorkers: 1,
  maxWorkers: 8,
  scaleUpThreshold: 5,
  scaleDownThreshold: 3,
  healthCheckIntervalMs: 10_000,
};

export interface ScalingSignal {
  recommendation: "scale-up" | "scale-down" | "stable";
  currentWorkers: number;
  targetWorkers: number;
  reason: string;
}

export interface ClusterHealth {
  totalWorkers: number;
  idleWorkers: number;
  processingWorkers: number;
  stoppedWorkers: number;
  queueMetrics: QueueMetrics;
  workerMetrics: WorkerMetrics[];
  scalingSignal: ScalingSignal;
}

export class ExecutionCoordinator {
  private workers: Map<string, ExecutionWorker> = new Map();
  private queue: ExecutionJobQueue;
  private agentRegistry: AgentRegistry;
  private config: CoordinatorConfig;
  private workerCounter = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    agentRegistry: AgentRegistry,
    queue?: ExecutionJobQueue,
    config?: Partial<CoordinatorConfig>,
  ) {
    this.agentRegistry = agentRegistry;
    this.queue = queue ?? new ExecutionJobQueue();
    this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Initialize the coordinator with minimum workers and start health monitoring.
   */
  initialize(): void {
    // Create minimum workers
    for (let i = 0; i < this.config.minWorkers; i++) {
      this.addWorker();
    }

    // Start health check loop
    this.healthTimer = setInterval(() => {
      this.healthCheck();
    }, this.config.healthCheckIntervalMs);

    console.log(
      `[EXEC-COORD] Initialized | Workers: ${this.workers.size} | Min: ${this.config.minWorkers} | Max: ${this.config.maxWorkers}`,
    );
  }

  /**
   * Shutdown all workers and the coordinator.
   */
  shutdown(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    for (const worker of this.workers.values()) {
      worker.stop();
    }
    this.workers.clear();

    console.log("[EXEC-COORD] Shutdown complete");
  }

  // ─── Worker Pool ──────────────────────────────────────────────────────

  addWorker(): ExecutionWorker {
    this.workerCounter++;
    const workerId = `exec-worker-${this.workerCounter}`;
    const worker = new ExecutionWorker(
      workerId,
      this.queue,
      this.agentRegistry,
      this.config.workerConfig,
    );
    worker.start();
    this.workers.set(workerId, worker);
    return worker;
  }

  removeWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.stop();
      this.workers.delete(workerId);
    }
  }

  // ─── Job Dispatch ─────────────────────────────────────────────────────

  /**
   * Submit a new execution job. Returns the job for async tracking.
   */
  submit(params: {
    intent: string;
    constraints?: string[];
    projectId?: string;
    priority?: number;
    maxAttempts?: number;
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  }): ExecutionJob {
    const job = this.queue.enqueue(params);
    console.log(
      `[EXEC-COORD] Job submitted | ID: ${job.jobId} | Intent: ${job.intent.slice(0, 50)}`,
    );
    return job;
  }

  /**
   * Get job status.
   */
  getJobStatus(jobId: string): ExecutionJob | null {
    return this.queue.getJob(jobId);
  }

  // ─── Health & Scaling ─────────────────────────────────────────────────

  private healthCheck(): void {
    const signal = this.computeScalingSignal();

    if (
      signal.recommendation === "scale-up" &&
      this.workers.size < this.config.maxWorkers
    ) {
      const toAdd = Math.min(
        signal.targetWorkers - this.workers.size,
        this.config.maxWorkers - this.workers.size,
      );
      for (let i = 0; i < toAdd; i++) {
        this.addWorker();
      }
      console.log(
        `[EXEC-COORD] Scaled up | Added: ${toAdd} | Total: ${this.workers.size}`,
      );
    }

    if (
      signal.recommendation === "scale-down" &&
      this.workers.size > this.config.minWorkers
    ) {
      const idleWorkers = [...this.workers.values()].filter(
        (w) => w.getState() === "idle",
      );
      const toRemove = Math.min(
        idleWorkers.length - this.config.minWorkers,
        this.workers.size - this.config.minWorkers,
      );
      for (let i = 0; i < toRemove && i < idleWorkers.length; i++) {
        this.removeWorker(idleWorkers[i].workerId);
      }
      if (toRemove > 0) {
        console.log(
          `[EXEC-COORD] Scaled down | Removed: ${toRemove} | Total: ${this.workers.size}`,
        );
      }
    }

    // Replace dead/stopped workers
    for (const [id, worker] of this.workers) {
      if (worker.getState() === "stopped") {
        this.workers.delete(id);
        this.addWorker();
        console.log(`[EXEC-COORD] Replaced dead worker: ${id}`);
      }
    }
  }

  computeScalingSignal(): ScalingSignal {
    const queueDepth = this.queue.depth;
    const workerCount = this.workers.size;
    const idleCount = [...this.workers.values()].filter(
      (w) => w.getState() === "idle",
    ).length;

    if (queueDepth >= this.config.scaleUpThreshold) {
      const target = Math.min(
        workerCount + Math.ceil(queueDepth / 2),
        this.config.maxWorkers,
      );
      return {
        recommendation: "scale-up",
        currentWorkers: workerCount,
        targetWorkers: target,
        reason: `Queue depth (${queueDepth}) exceeds threshold (${this.config.scaleUpThreshold})`,
      };
    }

    if (
      idleCount >= this.config.scaleDownThreshold &&
      workerCount > this.config.minWorkers
    ) {
      const target = Math.max(
        workerCount - (idleCount - 1),
        this.config.minWorkers,
      );
      return {
        recommendation: "scale-down",
        currentWorkers: workerCount,
        targetWorkers: target,
        reason: `${idleCount} idle workers exceeds threshold (${this.config.scaleDownThreshold})`,
      };
    }

    return {
      recommendation: "stable",
      currentWorkers: workerCount,
      targetWorkers: workerCount,
      reason: "Load is balanced",
    };
  }

  // ─── Reporting ────────────────────────────────────────────────────────

  getClusterHealth(): ClusterHealth {
    const workerMetrics = [...this.workers.values()].map((w) => w.getMetrics());
    const idleWorkers = workerMetrics.filter((m) => m.state === "idle").length;
    const processingWorkers = workerMetrics.filter(
      (m) => m.state === "processing",
    ).length;
    const stoppedWorkers = workerMetrics.filter(
      (m) => m.state === "stopped",
    ).length;

    return {
      totalWorkers: this.workers.size,
      idleWorkers,
      processingWorkers,
      stoppedWorkers,
      queueMetrics: this.queue.getMetrics(),
      workerMetrics,
      scalingSignal: this.computeScalingSignal(),
    };
  }

  getQueue(): ExecutionJobQueue {
    return this.queue;
  }

  get workerCount(): number {
    return this.workers.size;
  }
}
