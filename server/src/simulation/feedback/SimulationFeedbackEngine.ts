/**
 * SimulationFeedbackEngine.ts
 *
 * Converts simulation metrics + playtest issues into actionable feedback.
 * Maps issues to blueprint corrections and improvement suggestions.
 */

import type { PlaytestReport } from "../agents/PlaytestAgent";
import type { GameplayMetrics } from "../metrics/GameplayMetricsEngine";

export interface FeedbackItem {
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  action: string;
  target: string; // which blueprint section to fix
  reasoning: string;
}

export interface SimulationFeedback {
  blueprintId: string;
  items: FeedbackItem[];
  overallGrade: "A" | "B" | "C" | "D" | "F";
  shouldRegenerate: boolean;
  summary: string;
}

export class SimulationFeedbackEngine {
  /**
   * Generate structured feedback from playtest + metrics.
   */
  generateFeedback(
    report: PlaytestReport,
    metrics: GameplayMetrics,
  ): SimulationFeedback {
    const items: FeedbackItem[] = [];

    // Convert playtest issues to feedback items
    for (const issue of report.issues) {
      items.push({
        priority: issue.severity,
        category: issue.category,
        action: this.issueToAction(issue.category, issue.description),
        target: this.categoryToTarget(issue.category),
        reasoning: issue.description,
      });
    }

    // Metrics-based feedback
    if (metrics.completionRate < 0.5) {
      items.push({
        priority: "high",
        category: "progression",
        action: "Reduce obstacles preventing core loop completion",
        target: "coreLoop",
        reasoning: `Only ${Math.round(metrics.completionRate * 100)}% loop completion achieved`,
      });
    }

    if (metrics.economyStability < 30) {
      items.push({
        priority: "medium",
        category: "economy",
        action: "Rebalance currency earn rate vs progression costs",
        target: "economy",
        reasoning: `Economy stability score: ${metrics.economyStability}/100`,
      });
    }

    if (metrics.npcInteractionFrequency < 0.5) {
      items.push({
        priority: "low",
        category: "world",
        action: "Improve NPC placement or add interaction incentives",
        target: "npcs",
        reasoning: `NPC interaction frequency: ${metrics.npcInteractionFrequency} per 10 ticks`,
      });
    }

    // Overall grade
    const grade = this.computeGrade(report.engagementScore, metrics);
    const shouldRegenerate =
      grade === "F" ||
      (grade === "D" &&
        items.filter((i) => i.priority === "critical").length > 0);

    const summary = `Engagement: ${report.engagementScore}/100 | Grade: ${grade} | Issues: ${items.length} | Regenerate: ${shouldRegenerate ? "YES" : "NO"}`;

    console.log(`[FEEDBACK] ${summary}`);

    return {
      blueprintId: report.blueprintId,
      items,
      overallGrade: grade,
      shouldRegenerate,
      summary,
    };
  }

  private issueToAction(category: string, description: string): string {
    switch (category) {
      case "friction":
        return "Add variety to gameplay pacing";
      case "broken-loop":
        return "Ensure all core loop steps are achievable";
      case "dead-end":
        return "Add pathways or markers to guide player";
      case "economy":
        return "Adjust currency/reward balance";
      case "pacing":
        return "Add tutorial or gradual difficulty scaling";
      default:
        return `Address: ${description}`;
    }
  }

  private categoryToTarget(category: string): string {
    switch (category) {
      case "friction":
      case "pacing":
        return "mechanics";
      case "broken-loop":
        return "coreLoop";
      case "dead-end":
        return "world";
      case "economy":
        return "economy";
      default:
        return "general";
    }
  }

  private computeGrade(
    engagement: number,
    metrics: GameplayMetrics,
  ): "A" | "B" | "C" | "D" | "F" {
    const composite =
      engagement * 0.4 +
      metrics.completionRate * 100 * 0.3 +
      metrics.economyStability * 0.3;
    if (composite >= 80) return "A";
    if (composite >= 65) return "B";
    if (composite >= 50) return "C";
    if (composite >= 35) return "D";
    return "F";
  }
}
