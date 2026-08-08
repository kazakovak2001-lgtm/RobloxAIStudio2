/**
 * RepairPlanner — Analyzes PlaytestReport and creates a repair plan.
 */

import type { PlaytestReport, PlaytestIssue } from "../playtest";
import type {
  RepairPlan,
  RepairPlanItem,
  RepairStrategy,
  RepairDecision,
} from "./RepairTypes";

export class RepairPlanner {
  /**
   * Create a repair plan from a playtest report.
   */
  plan(
    report: PlaytestReport,
    iteration: number,
    targetScore: number,
  ): RepairPlan {
    const items: RepairPlanItem[] = [];

    for (const issue of report.issues) {
      const strategy = this.selectStrategy(issue);
      const decision = this.decide(issue, report.overallScore, targetScore);

      items.push({
        issueId: issue.id,
        severity: issue.severity,
        targetArtifact: issue.affectedArtifact,
        repairStrategy: strategy,
        estimatedImpact: this.estimateImpact(issue),
        priority: issue.priority,
        decision,
        reason: issue.reason,
        recommendedFix: issue.recommendedFix,
      });
    }

    // Sort by priority (lower = higher priority)
    items.sort((a, b) => a.priority - b.priority);

    return {
      projectId: report.projectId,
      iteration,
      items,
      targetScore,
      currentScore: report.overallScore,
      createdAt: Date.now(),
    };
  }

  private selectStrategy(issue: PlaytestIssue): RepairStrategy {
    const reason = issue.reason.toLowerCase();
    const category = issue.category;

    if (reason.includes("missing") && reason.includes("remote"))
      return "create_remote_event";
    if (reason.includes("missing") && reason.includes("module"))
      return "create_module_script";
    if (reason.includes("circular")) return "repair_dependency_graph";
    if (reason.includes("placed") || reason.includes("placement"))
      return "move_script";
    if (reason.includes("configuration") || reason.includes("config"))
      return "regenerate_configuration";
    if (reason.includes("asset")) return "fix_asset_reference";
    if (reason.includes("ui")) return "regenerate_ui";
    if (category === "dependencies") return "repair_dependency_graph";
    if (category === "assets") return "update_asset_manifest";

    return "regenerate_script";
  }

  private decide(
    issue: PlaytestIssue,
    currentScore: number,
    targetScore: number,
  ): RepairDecision {
    // Critical issues always get repaired
    if (issue.severity === "critical") return "repair";

    // If we're close to target, skip low-priority items
    if (currentScore >= targetScore - 5 && issue.severity === "suggestion")
      return "ignore";

    // Warnings get repaired
    if (issue.severity === "warning") return "repair";

    // Suggestions and optimizations depend on score gap
    if (targetScore - currentScore > 15) return "repair";

    return "ignore";
  }

  private estimateImpact(issue: PlaytestIssue): number {
    switch (issue.severity) {
      case "critical":
        return 20;
      case "warning":
        return 10;
      case "suggestion":
        return 5;
      case "optimization":
        return 3;
      default:
        return 1;
    }
  }
}
