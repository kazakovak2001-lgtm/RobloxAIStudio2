/**
 * RemoteWorkerClient.ts
 *
 * Represents a remote execution endpoint.
 * Abstracts network communication for job dispatch/result retrieval.
 * Vendor-agnostic: uses fetch API for HTTP-based communication.
 * In production, this would be backed by gRPC, WebSocket, or cloud-specific SDK.
 */

import type { CompilerJob } from "../distributed/JobQueueManager";
import type { JobResult } from "../distributed/CompilerWorkerNode";

export class RemoteWorkerClient {
  readonly nodeId: string;
  readonly endpoint: string;
  private healthy = true;
  private lastLatencyMs = 0;

  constructor(nodeId: string, endpoint: string) {
    this.nodeId = nodeId;
    this.endpoint = endpoint;
  }

  /**
   * Send a job to the remote worker and await result.
   * Uses HTTP POST as the network abstraction.
   */
  async execute(job: CompilerJob): Promise<JobResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.endpoint}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.jobId,
          projectId: job.projectId,
          type: job.type,
          payload: job.payload,
        }),
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      });

      this.lastLatencyMs = Date.now() - start;

      if (!response.ok) {
        this.healthy = false;
        const errorText = await response.text().catch(() => "Unknown error");
        return {
          jobId: job.jobId,
          success: false,
          error: `Remote node ${this.nodeId} returned ${response.status}: ${errorText}`,
          durationMs: this.lastLatencyMs,
          workerId: this.nodeId,
        };
      }

      const result = (await response.json()) as JobResult;
      this.healthy = true;
      return {
        ...result,
        workerId: this.nodeId,
        durationMs: this.lastLatencyMs,
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      this.healthy = false;
      return {
        jobId: job.jobId,
        success: false,
        error: `Network error to ${this.nodeId}: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: this.lastLatencyMs,
        workerId: this.nodeId,
      };
    }
  }

  /**
   * Ping the remote node to check liveness.
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      this.healthy = response.ok;
      return this.healthy;
    } catch {
      this.healthy = false;
      return false;
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  getLatency(): number {
    return this.lastLatencyMs;
  }
}
