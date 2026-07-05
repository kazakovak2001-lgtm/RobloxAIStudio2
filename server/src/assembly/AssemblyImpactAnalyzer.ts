import type { AssemblyDiff, DiffNode } from "./AssemblyDiffEngine";
import type { ChangeGraph, GraphNode } from "./AssemblyChangeGraph";
import { DependencyResolver, type DependencyMap } from "./DependencyResolver";

/**
 * ImpactNode — an affected system element with severity and reason.
 */
export interface ImpactNode {
  type: "script" | "world" | "network" | "asset" | "config";
  path: string;
  name: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  dependsOn?: string[];
}

/**
 * ImpactAnalysis — predictive impact assessment of a set of changes.
 */
export interface ImpactAnalysis {
  assemblyId: string;
  fromVersion: string;
  toVersion: string;
  impactScore: number; // 0–100 (higher = more risk)
  affectedNodes: ImpactNode[];
  riskBreakdown: {
    scripts: number;
    world: number;
    network: number;
    assets: number;
    configuration: number;
  };
  propagationDepth: number;
  criticalPaths: string[];
  circularRisks: string[];
  recommendation: string;
}

/**
 * AssemblyImpactAnalyzer
 *
 * Computes downstream impact of structural changes using dependency graphs.
 * Assigns risk scores, identifies critical paths, and produces predictive
 * impact assessments for use in CI guards and optimization safety checks.
 *
 * Deterministic: same diff + graph → same ImpactAnalysis.
 */
export class AssemblyImpactAnalyzer {
  private resolver = new DependencyResolver();

  /**
   * Analyze the impact of changes described by a diff and its corresponding graph.
   */
  analyzeImpact(diff: AssemblyDiff, graph: ChangeGraph): ImpactAnalysis {
    const depMap = this.resolver.resolveDependencies(graph);
    const affectedNodes: ImpactNode[] = [];
    const criticalPaths: string[] = [];

    // ── Direct changes → impact nodes ────────────────────────────────────
    const allChanged = [
      ...diff.changes.added.map((n) => ({
        ...n,
        changeKind: "added" as const,
      })),
      ...diff.changes.removed.map((n) => ({
        ...n,
        changeKind: "removed" as const,
      })),
      ...diff.changes.modified.map((n) => ({
        ...n,
        changeKind: "modified" as const,
      })),
      ...diff.changes.moved.map((n) => ({
        ...n,
        changeKind: "moved" as const,
      })),
    ];

    for (const change of allChanged) {
      const severity = this.computeSeverity(change, depMap, graph);
      affectedNodes.push({
        type: change.type as ImpactNode["type"],
        path: change.path,
        name: change.name,
        severity,
        reason: this.buildReason(
          change.changeKind,
          change.type,
          depMap,
          graph,
          change.path,
        ),
        dependsOn: this.findDependsOn(change.path, graph),
      });
    }

    // ── Downstream propagation ───────────────────────────────────────────
    const indirectlyAffected = this.computeIndirectImpact(
      allChanged,
      graph,
      depMap,
    );
    for (const indirect of indirectlyAffected) {
      if (!affectedNodes.some((n) => n.path === indirect.path)) {
        affectedNodes.push(indirect);
      }
    }

    // ── Risk breakdown per category ──────────────────────────────────────
    const riskBreakdown = {
      scripts: this.categoryRisk(affectedNodes, "script"),
      world: this.categoryRisk(affectedNodes, "world"),
      network: this.categoryRisk(affectedNodes, "network"),
      assets: this.categoryRisk(affectedNodes, "asset"),
      configuration: this.categoryRisk(affectedNodes, "config"),
    };

    // ── Propagation depth ────────────────────────────────────────────────
    let maxPropDepth = 0;
    for (const change of allChanged) {
      const graphNode = graph.nodes.find((n) => n.path === change.path);
      if (graphNode) {
        const depth = this.resolver.getPropagationDepth(graphNode.id, depMap);
        if (depth > maxPropDepth) maxPropDepth = depth;
      }
    }

    // ── Critical paths (nodes with high downstream impact) ───────────────
    for (const node of graph.nodes) {
      const downstreamCount = depMap.downstream.get(node.id)?.size ?? 0;
      if (downstreamCount >= 3) {
        criticalPaths.push(node.path);
      }
    }

    // ── Overall impact score ─────────────────────────────────────────────
    const impactScore = this.computeOverallScore(
      affectedNodes,
      maxPropDepth,
      depMap.circularRisks.length,
      diff.summary.totalChanges,
    );

    // ── Recommendation ───────────────────────────────────────────────────
    const recommendation = this.buildRecommendation(
      impactScore,
      affectedNodes,
      depMap,
    );

    console.log(
      `[IMPACT] Analysis | Assembly: ${diff.assemblyId} | Score: ${impactScore} | ` +
        `Affected: ${affectedNodes.length} | Propagation: ${maxPropDepth} | Critical: ${criticalPaths.length}`,
    );

    return {
      assemblyId: diff.assemblyId,
      fromVersion: diff.fromVersion,
      toVersion: diff.toVersion,
      impactScore,
      affectedNodes,
      riskBreakdown,
      propagationDepth: maxPropDepth,
      criticalPaths,
      circularRisks: depMap.circularRisks,
      recommendation,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private computeSeverity(
    change: DiffNode & { changeKind: string },
    depMap: DependencyMap,
    graph: ChangeGraph,
  ): ImpactNode["severity"] {
    const graphNode = graph.nodes.find((n) => n.path === change.path);
    const downstreamCount = graphNode
      ? (depMap.downstream.get(graphNode.id)?.size ?? 0)
      : 0;

    if (change.changeKind === "removed" && downstreamCount > 2)
      return "critical";
    if (change.changeKind === "removed") return "high";
    if (change.type === "network" && change.changeKind === "modified")
      return "high";
    if (downstreamCount > 3) return "high";
    if (downstreamCount > 1) return "medium";
    if (change.changeKind === "modified") return "medium";
    return "low";
  }

  private buildReason(
    changeKind: string,
    type: string,
    depMap: DependencyMap,
    graph: ChangeGraph,
    path: string,
  ): string {
    const graphNode = graph.nodes.find((n) => n.path === path);
    const downstream = graphNode
      ? (depMap.downstream.get(graphNode.id)?.size ?? 0)
      : 0;

    if (changeKind === "removed")
      return `Removed ${type} — ${downstream} downstream dependents may break`;
    if (changeKind === "added")
      return `Added ${type} — no existing dependents affected`;
    if (changeKind === "moved")
      return `Moved ${type} — references may need updating`;
    return `Modified ${type} — ${downstream} downstream nodes may need validation`;
  }

  private findDependsOn(
    path: string,
    graph: ChangeGraph,
  ): string[] | undefined {
    const node = graph.nodes.find((n) => n.path === path);
    if (!node) return undefined;
    const deps = graph.edges
      .filter((e) => e.from === node.id && e.relationship === "depends_on")
      .map((e) => {
        const target = graph.nodes.find((n) => n.id === e.to);
        return target?.path ?? e.to;
      });
    return deps.length > 0 ? deps : undefined;
  }

  private computeIndirectImpact(
    directChanges: Array<DiffNode & { changeKind: string }>,
    graph: ChangeGraph,
    depMap: DependencyMap,
  ): ImpactNode[] {
    const indirect: ImpactNode[] = [];
    const directPaths = new Set(directChanges.map((c) => c.path));

    for (const change of directChanges) {
      const graphNode = graph.nodes.find((n) => n.path === change.path);
      if (!graphNode) continue;

      const downstream = depMap.downstream.get(graphNode.id);
      if (!downstream) continue;

      for (const depId of downstream) {
        const depNode = graph.nodes.find((n) => n.id === depId);
        if (!depNode || directPaths.has(depNode.path)) continue;

        indirect.push({
          type: depNode.type as ImpactNode["type"],
          path: depNode.path,
          name: depNode.name,
          severity: "low",
          reason: `Indirectly affected by change to ${change.path}`,
          dependsOn: [change.path],
        });
      }
    }

    return indirect;
  }

  private categoryRisk(nodes: ImpactNode[], type: ImpactNode["type"]): number {
    const ofType = nodes.filter((n) => n.type === type);
    if (ofType.length === 0) return 0;
    const severityWeights = { low: 5, medium: 15, high: 30, critical: 50 };
    let total = 0;
    for (const node of ofType) {
      total += severityWeights[node.severity];
    }
    return Math.min(100, total);
  }

  private computeOverallScore(
    affectedNodes: ImpactNode[],
    propagationDepth: number,
    circularCount: number,
    totalChanges: number,
  ): number {
    const severityWeights = { low: 2, medium: 8, high: 20, critical: 35 };
    let score = 0;

    for (const node of affectedNodes) {
      score += severityWeights[node.severity];
    }

    // Depth multiplier
    score += propagationDepth * 5;

    // Circular risk penalty
    score += circularCount * 15;

    // Volume factor
    score += Math.min(totalChanges * 2, 20);

    return Math.max(0, Math.min(100, score));
  }

  private buildRecommendation(
    score: number,
    affectedNodes: ImpactNode[],
    depMap: DependencyMap,
  ): string {
    if (score >= 75) {
      return "HIGH RISK: Review all critical paths before proceeding. Consider incremental changes.";
    }
    if (score >= 50) {
      return "MODERATE RISK: Validate affected systems. Run targeted tests on downstream dependencies.";
    }
    if (score >= 25) {
      const criticalCount = affectedNodes.filter(
        (n) => n.severity === "critical" || n.severity === "high",
      ).length;
      if (criticalCount > 0) {
        return `LOW-MODERATE RISK: ${criticalCount} high-severity nodes affected. Spot-check recommended.`;
      }
      return "LOW RISK: Changes are localized. Standard validation sufficient.";
    }
    return "MINIMAL RISK: Changes are isolated with no significant propagation.";
  }
}
