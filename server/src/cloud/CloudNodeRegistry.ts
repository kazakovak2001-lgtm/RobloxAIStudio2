/**
 * CloudNodeRegistry.ts
 *
 * Central registry of all remote compiler nodes.
 * Supports dynamic registration, heartbeat tracking, and region-based queries.
 * Vendor-agnostic — no cloud provider dependencies.
 */

export interface NodeCapacity {
  cpu: number; // 0–100 utilization percentage
  memory: number; // 0–100 utilization percentage
  queueDepth: number; // pending jobs on this node
}

export type NodeStatus = "online" | "offline" | "degraded";

export interface CloudNode {
  nodeId: string;
  region: string;
  endpoint: string; // Network address for job dispatch
  status: NodeStatus;
  capacity: NodeCapacity;
  lastHeartbeat: Date;
  registeredAt: Date;
  tags?: string[];
  maxConcurrency: number;
}

export class CloudNodeRegistry {
  private nodes = new Map<string, CloudNode>();
  private heartbeatThresholdMs: number;

  constructor(heartbeatThresholdMs = 30000) {
    this.heartbeatThresholdMs = heartbeatThresholdMs;
  }

  registerNode(node: CloudNode): void {
    this.nodes.set(node.nodeId, {
      ...node,
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
    });
    console.log(
      `[CLOUD] Node registered | ID: ${node.nodeId} | Region: ${node.region} | Endpoint: ${node.endpoint}`,
    );
  }

  unregisterNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    console.log(`[CLOUD] Node unregistered | ID: ${nodeId}`);
  }

  heartbeat(nodeId: string, capacity?: NodeCapacity): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.lastHeartbeat = new Date();
    if (capacity) node.capacity = capacity;
    // Auto-recover degraded nodes on heartbeat
    if (node.status === "degraded") node.status = "online";
  }

  getNode(nodeId: string): CloudNode | null {
    return this.nodes.get(nodeId) ?? null;
  }

  getAvailableNodes(): CloudNode[] {
    this.refreshStatuses();
    return Array.from(this.nodes.values()).filter(
      (n) =>
        n.status === "online" &&
        n.capacity.cpu < 90 &&
        n.capacity.queueDepth < n.maxConcurrency,
    );
  }

  getNodesByRegion(region: string): CloudNode[] {
    this.refreshStatuses();
    return Array.from(this.nodes.values()).filter(
      (n) => n.region === region && n.status !== "offline",
    );
  }

  getAllNodes(): CloudNode[] {
    this.refreshStatuses();
    return Array.from(this.nodes.values());
  }

  getRegions(): string[] {
    const regions = new Set<string>();
    for (const node of this.nodes.values()) regions.add(node.region);
    return Array.from(regions);
  }

  markDegraded(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.status = "degraded";
  }

  markOffline(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.status = "offline";
  }

  get size(): number {
    return this.nodes.size;
  }

  private refreshStatuses(): void {
    const now = Date.now();
    for (const node of this.nodes.values()) {
      const elapsed = now - node.lastHeartbeat.getTime();
      if (elapsed > this.heartbeatThresholdMs * 2) {
        node.status = "offline";
      } else if (elapsed > this.heartbeatThresholdMs) {
        node.status = "degraded";
      }
    }
  }
}

let _instance: CloudNodeRegistry | null = null;
export function getCloudNodeRegistry(): CloudNodeRegistry {
  if (!_instance) _instance = new CloudNodeRegistry();
  return _instance;
}
