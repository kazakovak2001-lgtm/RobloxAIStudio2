/**
 * ClusterTopologyManager.ts
 *
 * Maintains global view of the distributed system.
 * Tracks node distribution per region, detects imbalances,
 * recommends scaling actions, and provides a unified health map.
 */

import {
  CloudNodeRegistry,
  getCloudNodeRegistry,
  type CloudNode,
} from "./CloudNodeRegistry";

export interface RegionTopology {
  region: string;
  totalNodes: number;
  onlineNodes: number;
  degradedNodes: number;
  offlineNodes: number;
  avgCpuUtilization: number;
  avgQueueDepth: number;
  totalCapacity: number;
}

export interface ClusterTopology {
  totalNodes: number;
  totalRegions: number;
  regions: RegionTopology[];
  healthScore: number; // 0–100
  imbalanced: boolean;
  recommendations: string[];
}

export interface HealthMap {
  nodes: Array<{
    nodeId: string;
    region: string;
    status: string;
    cpu: number;
    memory: number;
    queueDepth: number;
    healthy: boolean;
  }>;
}

export class ClusterTopologyManager {
  private registry: CloudNodeRegistry;

  constructor(registry?: CloudNodeRegistry) {
    this.registry = registry ?? getCloudNodeRegistry();
  }

  /**
   * Get full cluster topology analysis.
   */
  getTopology(): ClusterTopology {
    const allNodes = this.registry.getAllNodes();
    const regions = this.registry.getRegions();
    const regionTopos: RegionTopology[] = [];

    for (const region of regions) {
      const nodes = allNodes.filter((n) => n.region === region);
      const online = nodes.filter((n) => n.status === "online");
      const degraded = nodes.filter((n) => n.status === "degraded");
      const offline = nodes.filter((n) => n.status === "offline");

      const avgCpu =
        online.length > 0
          ? online.reduce((s, n) => s + n.capacity.cpu, 0) / online.length
          : 0;
      const avgQueue =
        online.length > 0
          ? online.reduce((s, n) => s + n.capacity.queueDepth, 0) /
            online.length
          : 0;

      regionTopos.push({
        region,
        totalNodes: nodes.length,
        onlineNodes: online.length,
        degradedNodes: degraded.length,
        offlineNodes: offline.length,
        avgCpuUtilization: Math.round(avgCpu),
        avgQueueDepth: Math.round(avgQueue),
        totalCapacity: online.reduce((s, n) => s + n.maxConcurrency, 0),
      });
    }

    const totalOnline = allNodes.filter((n) => n.status === "online").length;
    const healthScore =
      allNodes.length > 0
        ? Math.round((totalOnline / allNodes.length) * 100)
        : 0;

    const imbalanced = this.detectImbalance(regionTopos);
    const recommendations = this.generateRecommendations(
      regionTopos,
      healthScore,
    );

    return {
      totalNodes: allNodes.length,
      totalRegions: regions.length,
      regions: regionTopos,
      healthScore,
      imbalanced,
      recommendations,
    };
  }

  /**
   * Recommend rebalancing if needed.
   */
  rebalance(): string[] {
    const topology = this.getTopology();
    return topology.recommendations;
  }

  /**
   * Get a flat health map of all nodes.
   */
  getHealthMap(): HealthMap {
    const allNodes = this.registry.getAllNodes();
    return {
      nodes: allNodes.map((n) => ({
        nodeId: n.nodeId,
        region: n.region,
        status: n.status,
        cpu: n.capacity.cpu,
        memory: n.capacity.memory,
        queueDepth: n.capacity.queueDepth,
        healthy: n.status === "online",
      })),
    };
  }

  private detectImbalance(regions: RegionTopology[]): boolean {
    if (regions.length < 2) return false;
    const loads = regions.map((r) => r.avgCpuUtilization);
    const max = Math.max(...loads);
    const min = Math.min(...loads);
    return max - min > 40; // >40% difference is imbalanced
  }

  private generateRecommendations(
    regions: RegionTopology[],
    healthScore: number,
  ): string[] {
    const recs: string[] = [];

    if (healthScore < 50) {
      recs.push(
        "CRITICAL: Cluster health below 50% — scale up or investigate node failures",
      );
    }

    for (const region of regions) {
      if (region.offlineNodes > 0) {
        recs.push(
          `Region ${region.region}: ${region.offlineNodes} offline nodes — investigate or replace`,
        );
      }
      if (region.avgCpuUtilization > 80) {
        recs.push(
          `Region ${region.region}: high CPU (${region.avgCpuUtilization}%) — consider adding nodes`,
        );
      }
      if (region.onlineNodes === 0 && region.totalNodes > 0) {
        recs.push(
          `Region ${region.region}: all nodes offline — critical failure`,
        );
      }
    }

    if (regions.length === 1 && regions[0].totalNodes > 3) {
      recs.push("Consider multi-region deployment for fault tolerance");
    }

    return recs;
  }
}
