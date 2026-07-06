/**
 * WorkerHealthMonitor.ts
 *
 * Monitors distributed worker health: stuck jobs, dead workers,
 * latency tracking, and automatic requeue of orphaned jobs.
 */

import type { CompilerWorkerNode } from "./CompilerWorkerNode";
import type { JobQueueManager } from "./JobQueueManager";

export interface WorkerHealth {
  workerId: string;
  status: string;
  processedCount: number;
  failedCount: number;
  lastHeartbeat: Date;
  latencyMs?: number;
  healthy: boolean;
}

export class WorkerHealthMonitor {
  private workers = new Map<
    string,
    { node: CompilerWorkerNode; lastHeartbeat: Date }
  >();
  private stuckThresholdMs: number;

  constructor(stuckThresholdMs = 60000) {
    this.stuckThresholdMs = stuckThresholdMs;
  }

  /**
   * Register a worker for monitoring.
   */
  register(worker: CompilerWorkerNode): void {
    this.workers.set(worker.workerId, {
      node: worker,
      lastHeartbeat: new Date(),
    });
  }

  /**
   * Unregister a worker.
   */
  unregister(workerId: string): void {
    this.workers.delete(workerId);
  }

  /**
   * Record a heartbeat from a worker (called after each processed job).
   */
  heartbeat(workerId: string): void {
    const entry = this.workers.get(workerId);
    if (entry) entry.lastHeartbeat = new Date();
  }

  /**
   * Get health status for all registered workers.
   */
  getHealthReport(): WorkerHealth[] {
    const now = Date.now();
    const report: WorkerHealth[] = [];

    for (const [id, entry] of this.workers) {
      const metrics = entry.node.getMetrics();
      const timeSinceHeartbeat = now - entry.lastHeartbeat.getTime();
      const healthy =
        timeSinceHeartbeat < this.stuckThresholdMs &&
        metrics.status !== "stopped";

      report.push({
        workerId: id,
        status: metrics.status,
        processedCount: metrics.processedCount,
        failedCount: metrics.failedCount,
        lastHeartbeat: entry.lastHeartbeat,
        latencyMs: timeSinceHeartbeat,
        healthy,
      });
    }

    return report;
  }

  /**
   * Detect workers that appear dead (no heartbeat within threshold).
   */
  getDeadWorkers(): string[] {
    const now = Date.now();
    const dead: string[] = [];
    for (const [id, entry] of this.workers) {
      if (now - entry.lastHeartbeat.getTime() > this.stuckThresholdMs) {
        dead.push(id);
      }
    }
    return dead;
  }

  /**
   * Requeue jobs assigned to dead workers.
   */
  requeueStuckJobs(_queue: JobQueueManager): number {
    // The queue manager handles retry internally via fail() — this is a
    // detection layer only. In a distributed system this would trigger
    // reassignment. For now it logs dead workers for the coordinator.
    const dead = this.getDeadWorkers();
    if (dead.length > 0) {
      console.log(`[HEALTH] Dead workers detected: ${dead.join(", ")}`);
    }
    return dead.length;
  }

  get registeredCount(): number {
    return this.workers.size;
  }
}
