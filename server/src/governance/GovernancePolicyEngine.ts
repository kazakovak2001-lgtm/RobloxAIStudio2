import type { ImpactAnalysis } from "../assembly/AssemblyImpactAnalyzer";
import type { PolicyRule } from "./PolicyRegistry";
import { PolicyRegistry, getDefaultPolicyRegistry } from "./PolicyRegistry";

/**
 * GovernanceDecision — the authoritative output of the governance engine.
 */
export interface GovernanceDecision {
  assemblyId: string;
  status: "ALLOW" | "WARN" | "BLOCK";
  triggeredRules: PolicyRule[];
  finalScore: number;
  reasons: string[];
  recommendedAction: string;
  evaluatedAt: Date;
}

/**
 * GovernancePolicyEngine
 *
 * Evaluates governance rules against ImpactAnalysis results.
 * Produces a deterministic GovernanceDecision: ALLOW, WARN, or BLOCK.
 *
 * Rule evaluation is ordered by severity (critical first).
 * A single BLOCK rule triggers BLOCK status.
 * One or more WARN rules without BLOCK triggers WARN status.
 * No triggered rules → ALLOW.
 *
 * Deterministic: same ImpactAnalysis + same policies → same decision.
 */
export class GovernancePolicyEngine {
  private registry: PolicyRegistry;

  constructor(registry?: PolicyRegistry) {
    this.registry = registry ?? getDefaultPolicyRegistry();
  }

  /**
   * Evaluate all active policies against an impact analysis.
   */
  evaluatePolicies(analysis: ImpactAnalysis): GovernanceDecision {
    const policies = this.registry.getActivePolicies();
    const triggered: PolicyRule[] = [];
    const reasons: string[] = [];

    // Evaluate each policy
    for (const policy of policies) {
      if (this.evaluateCondition(policy, analysis)) {
        triggered.push(policy);
        reasons.push(
          `[${policy.id}] ${policy.name}: ${policy.condition} → ${policy.action}`,
        );
      }
    }

    // Determine status (BLOCK > WARN > ALLOW)
    const hasBlock = triggered.some((p) => p.action === "block");
    const hasWarn = triggered.some((p) => p.action === "warn");

    let status: GovernanceDecision["status"];
    if (hasBlock) {
      status = "BLOCK";
    } else if (hasWarn) {
      status = "WARN";
    } else {
      status = "ALLOW";
    }

    const recommendedAction = this.buildRecommendation(
      status,
      triggered,
      analysis,
    );

    console.log(
      `[GOVERNANCE] Decision: ${status} | Assembly: ${analysis.assemblyId} | ` +
        `Score: ${analysis.impactScore} | Triggered: ${triggered.length}/${policies.length} rules`,
    );

    return {
      assemblyId: analysis.assemblyId,
      status,
      triggeredRules: triggered,
      finalScore: analysis.impactScore,
      reasons,
      recommendedAction,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Evaluate a single policy condition against the analysis.
   * Uses deterministic rule matching — no eval().
   */
  private evaluateCondition(
    policy: PolicyRule,
    analysis: ImpactAnalysis,
  ): boolean {
    switch (policy.id) {
      case "P1": // impactScore >= 75
        return analysis.impactScore >= policy.threshold;

      case "P2": // criticalPaths.length > 0 && impactScore >= 50
        return (
          analysis.criticalPaths.length > 0 &&
          analysis.impactScore >= policy.threshold
        );

      case "P3": // propagationDepth >= 4
        return analysis.propagationDepth >= policy.threshold;

      case "P4": // riskBreakdown.network >= 30
        return analysis.riskBreakdown.network >= policy.threshold;

      case "P5": // circularRisks.length > 0
        return analysis.circularRisks.length >= policy.threshold;

      default:
        // Generic fallback: check if impactScore meets threshold
        return analysis.impactScore >= policy.threshold;
    }
  }

  private buildRecommendation(
    status: GovernanceDecision["status"],
    triggered: PolicyRule[],
    analysis: ImpactAnalysis,
  ): string {
    if (status === "BLOCK") {
      const blockers = triggered
        .filter((p) => p.action === "block")
        .map((p) => p.name);
      return `BUILD BLOCKED by: ${blockers.join(", ")}. Reduce impact score (currently ${analysis.impactScore}) or resolve critical dependencies before proceeding.`;
    }
    if (status === "WARN") {
      const warnings = triggered
        .filter((p) => p.action === "warn")
        .map((p) => p.name);
      return `BUILD ALLOWED WITH WARNINGS: ${warnings.join(", ")}. Review affected systems and validate downstream dependencies.`;
    }
    return "BUILD ALLOWED: All governance checks passed. No policy violations detected.";
  }
}
