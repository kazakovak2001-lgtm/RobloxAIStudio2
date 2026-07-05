/**
 * NetworkJobRouter.ts
 *
 * Extends job dispatch into distributed routing.
 * Assigns jobs to remote or local nodes, maintains job-to-node mapping,
 * reassigns failed jobs, and ensures deterministic routing given same cluster state.
 */

import type { CompilerJob } from "../distributed/JobQueueManager";
import type { JobResult } from "../distributed/CompilerWorkerNode";
import { NetworkDispatcher, type DispatchDecision } from "./NetworkDispatcher";
import {
  JobQueueManager,
  getJobQueueManager,
} from "../distributed/JobQueueManager";

export interface RoutingRecord {
  jobId: string;
  nodeId: string;
  mode: "remote" | "local" | "hybrid";
  region: string;
  dispatchedAt: Date;
  completedAt?: Date;
  success?: boolean;
  attempts: number;
}

export class NetworkJobRouter {
  private dispatcher: NetworkDispatcher;
  private queue: JobQueueManager;
  private routingTable = new Map<string, RoutingRecord>();

  constructor(dispatcher: NetworkDispatcher, queue?: JobQueueManager) {
    this.dispatcher = dispatcher;
    this.queue = queue ?? getJobQueueManager();
  }

  /**
   * Route a job to the best available execution target.
   * Tries remote first, falls back to local queue.
   */
  async routeJob(
    job: CompilerJob,
  ): Promise<{
    routed: boolean;
    decision: DispatchDecision;
    result?: JobResult;
  }> {
    // Try remote dispatch first
    if (this.dispatcher.hasRemoteNodes()) {
      const { decision, result } = await this.dispatcher.dispatch(job);

      this.routingTable.set(job.jobId, {
        jobId: job.jobId,
        nodeId: decision.nodeId,
        mode: decision.mode,
        region: decision.region,
        dispatchedAt: new Date(),
        attempts: 1,
        success: result.success,
        completedAt: result.success ? new Date() : undefined,
      });

      if (result.success) {
        return { routed: true, decision, result };
      }

      // Remote failed — fall back to local
      console.log(
        `[ROUTER] Remote dispatch failed for ${job.jobId}, falling back to local queue`,
      );
    }

    // Local queue fallback
    const localDecision: DispatchDecision = {
      nodeId: "local",
      mode: "local",
      region: "local",
      reason: "Routed to local worker pool (fallback or no remote nodes)",
    };

    // Enqueue locally — will be picked up by local workers
    this.queue.enqueue(
      job.projectId,
      job.type,
      job.payload,
      job.priority,
      job.maxAttempts,
    );

    this.routingTable.set(job.jobId, {
      jobId: job.jobId,
      nodeId: "local",
      mode: "local",
      region: "local",
      dispatchedAt: new Date(),
      attempts: (this.routingTable.get(job.jobId)?.attempts ?? 0) + 1,
    });

    return { routed: true, decision: localDecision };
  }

  /**
   * Reassign a failed job to a different node.
   */
  async reassignJob(job: CompilerJob): Promise<DispatchDecision> {
    const record = this.routingTable.get(job.jobId);
    if (record) record.attempts++;

    // Try remote with potential different node selection
    if (this.dispatcher.hasRemoteNodes()) {
      const { decision } = await this.dispatcher.dispatch(job);
      return decision;
    }

    return {
      nodeId: "local",
      mode: "local",
      region: "local",
      reason: "Reassigned to local (no remote available)",
    };
  }

  /**
   * Get routing record for a job.
   */
  getRouting(jobId: string): RoutingRecord | null {
    return this.routingTable.get(jobId) ?? null;
  }

  /**
   * Get routing metrics.
   */
  getMetrics() {
    const records = Array.from(this.routingTable.values());
    const remote = records.filter((r) => r.mode === "remote");
    const local = records.filter((r) => r.mode === "local");
    return {
      totalRouted: records.length,
      remoteRouted: remote.length,
      localRouted: local.length,
      remoteSuccessRate:
        remote.length > 0
          ? remote.filter((r) => r.success).length / remote.length
          : 0,
    };
  }
}
