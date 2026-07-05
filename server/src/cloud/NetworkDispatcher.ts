/**
 * NetworkDispatcher.ts
 *
 * Routes jobs to the optimal node (remote or local).
 * Selection criteria: region affinity, load, capacity, health.
 * Fallback to local execution on remote failure.
 */

import type { CompilerJob } from "../distributed/JobQueueManager";
import type { JobResult } from "../distributed/CompilerWorkerNode";
import {
  CloudNodeRegistry,
  getCloudNodeRegistry,
  type CloudNode,
} from "./CloudNodeRegistry";
import { RemoteWorkerClient } from "./RemoteWorkerClient";

export type DispatchMode = "remote" | "local" | "hybrid";

export interface DispatchDecision {
  nodeId: string;
  mode: DispatchMode;
  region: string;
  reason: string;
}

export class NetworkDispatcher {
  private registry: CloudNodeRegistry;
  private clients = new Map<string, RemoteWorkerClient>();
  private preferredRegion?: string;

  constructor(registry?: CloudNodeRegistry, preferredRegion?: string) {
    this.registry = registry ?? getCloudNodeRegistry();
    this.preferredRegion = preferredRegion;
  }

  /**
   * Select the optimal node and dispatch the job.
   * Returns the selected nodeId and result.
   */
  async dispatch(
    job: CompilerJob,
  ): Promise<{ decision: DispatchDecision; result: JobResult }> {
    const node = this.selectNode(job);

    if (!node) {
      // No remote node available — fallback signal
      return {
        decision: {
          nodeId: "local",
          mode: "local",
          region: "local",
          reason: "No remote nodes available",
        },
        result: {
          jobId: job.jobId,
          success: false,
          error: "NO_REMOTE_NODES",
          durationMs: 0,
          workerId: "local",
        },
      };
    }

    const client = this.getOrCreateClient(node);
    const result = await client.execute(job);

    // Update node capacity after execution
    if (result.success) {
      this.registry.heartbeat(node.nodeId);
    } else {
      this.registry.markDegraded(node.nodeId);
    }

    return {
      decision: {
        nodeId: node.nodeId,
        mode: "remote",
        region: node.region,
        reason: `Selected: lowest load in ${node.region} (cpu:${node.capacity.cpu}%, queue:${node.capacity.queueDepth})`,
      },
      result,
    };
  }

  /**
   * Select optimal node based on: region affinity → load → capacity.
   */
  selectNode(job: CompilerJob): CloudNode | null {
    const available = this.registry.getAvailableNodes();
    if (available.length === 0) return null;

    // 1. Prefer nodes in preferred region
    if (this.preferredRegion) {
      const regional = available.filter(
        (n) => n.region === this.preferredRegion,
      );
      if (regional.length > 0) {
        return this.lowestLoad(regional);
      }
    }

    // 2. Any available node — lowest load
    return this.lowestLoad(available);
  }

  /**
   * Set preferred region for routing.
   */
  setPreferredRegion(region: string): void {
    this.preferredRegion = region;
  }

  /**
   * Check if any remote nodes are available.
   */
  hasRemoteNodes(): boolean {
    return this.registry.getAvailableNodes().length > 0;
  }

  private lowestLoad(nodes: CloudNode[]): CloudNode {
    return nodes.sort((a, b) => {
      // Sort by composite score: cpu + queue depth normalized
      const scoreA =
        a.capacity.cpu + (a.capacity.queueDepth / a.maxConcurrency) * 100;
      const scoreB =
        b.capacity.cpu + (b.capacity.queueDepth / b.maxConcurrency) * 100;
      return scoreA - scoreB;
    })[0];
  }

  private getOrCreateClient(node: CloudNode): RemoteWorkerClient {
    let client = this.clients.get(node.nodeId);
    if (!client) {
      client = new RemoteWorkerClient(node.nodeId, node.endpoint);
      this.clients.set(node.nodeId, client);
    }
    return client;
  }
}
