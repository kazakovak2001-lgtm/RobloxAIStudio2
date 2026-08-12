/**
 * SimulationFeedbackEngine.ts
 *
 * Turns simulation findings into actionable feedback and one regeneration
 * decision.
 *
 * SIM-TRUTH-1. This used to compute a letter grade from
 * `engagement*0.4 + completionRate*100*0.3 + economyStability*0.3` against
 * thresholds of 80/65/50/35, and regenerate on `F`, or on `D` with a critical
 * item. Every weight and threshold was chosen by hand and none was derived from
 * anything; `engagement` was the removed score and `economyStability` was a
 * simulator constant, so two thirds of the composite could not vary with the
 * game.
 *
 * The grade is gone and no weighted number replaces it. Regeneration is decided
 * by a named, versioned policy over findings the simulation actually produced,
 * and when the evidence cannot support a decision the engine abstains and says
 * so rather than returning a passing grade.
 */

import type {
  SimulationEvidenceReport,
  SimulationFinding,
} from "../agents/PlaytestAgent";
import type { GameplayMetrics } from "../metrics/GameplayMetricsEngine";

export interface FeedbackItem {
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  action: string;
  target: string; // which blueprint section to fix
  reasoning: string;
  /** Carried from the finding, so simulator artifacts stay distinguishable. */
  attribution: SimulationFinding["attribution"];
}

/**
 * The rule that decided regeneration, named and versioned so it is readable as
 * policy rather than mistaken for a measurement.
 */
export const REGENERATION_POLICY_ID = "sim-findings-v1";

export type RegenerationOutcome = "regenerate" | "no-action" | "abstain";

export interface RegenerationDecision {
  readonly outcome: RegenerationOutcome;
  readonly policyId: typeof REGENERATION_POLICY_ID;
  /** Why, in terms of the evidence the policy read. */
  readonly reason: string;
  /** The findings the policy counted, named individually. */
  readonly evidenceUsed: string[];
}

export interface SimulationFeedback {
  blueprintId: string;
  items: FeedbackItem[];
  decision: RegenerationDecision;
  /** Convenience mirror of `decision.outcome === "regenerate"`. */
  shouldRegenerate: boolean;
  summary: string;
}

export class SimulationFeedbackEngine {
  /**
   * Generate structured feedback and a regeneration decision.
   */
  generateFeedback(
    report: SimulationEvidenceReport,
    metrics: GameplayMetrics,
  ): SimulationFeedback {
    const items: FeedbackItem[] = [];

    for (const finding of report.findings) {
      items.push({
        priority: finding.severity,
        category: finding.category,
        action: this.issueToAction(finding.category, finding.description),
        target: this.categoryToTarget(finding.category),
        reasoning: finding.description,
        attribution: finding.attribution,
      });
    }

    // Metric-derived advice. Only stated where the metric exists: an absent
    // ratio is not evidence of a problem.
    if (
      metrics.economyProgressionRatio !== null &&
      metrics.economyProgressionRatio === 0
    ) {
      items.push({
        priority: "medium",
        category: "economy",
        action: "Rebalance currency earn rate vs progression costs",
        target: "economy",
        reasoning:
          "Currency was gained and no level-up followed in this simulation",
        // Both sides of the ratio are simulator strides.
        attribution: "simulator-schedule",
      });
    }

    const decision = this.decide(report);

    const summary = `Evidence: deterministic-simulation | Findings: ${report.findings.length} | Decision: ${decision.outcome} (${decision.policyId}) | ${decision.reason}`;

    return {
      blueprintId: report.blueprintId,
      items,
      decision,
      shouldRegenerate: decision.outcome === "regenerate",
      summary,
    };
  }

  /**
   * `sim-findings-v1`.
   *
   * Regenerate when the run produced at least one `critical` or `high` finding
   * the blueprint is responsible for. Abstain when the run exercised nothing
   * the blueprint declared, because a run that could not test the game is not
   * evidence that the game is sound. Otherwise take no action.
   *
   * Findings attributed to the simulator's own schedule are never counted: they
   * are facts about this loop, not about the game.
   */
  private decide(report: SimulationEvidenceReport): RegenerationDecision {
    const actionable = report.findings.filter(
      (f) =>
        f.attribution === "blueprint" &&
        (f.severity === "critical" || f.severity === "high"),
    );

    if (actionable.length > 0) {
      return {
        outcome: "regenerate",
        policyId: REGENERATION_POLICY_ID,
        reason: `${actionable.length} actionable finding(s) attributed to the blueprint`,
        evidenceUsed: actionable.map((f) => `${f.category}: ${f.description}`),
      };
    }

    // A blueprint declaring nothing is not an uninformative run — it is a
    // blueprint finding, and the branch above has already acted on it. What
    // remains is a run that could not exercise what the blueprint did declare,
    // which is evidence about the simulation and not about the game.
    const { mechanicReach } = report.derived;
    if (mechanicReach.declared > 0 && mechanicReach.exercised === 0) {
      return {
        outcome: "abstain",
        policyId: REGENERATION_POLICY_ID,
        reason:
          "The simulation exercised none of the declared mechanics, so it is not evidence about the blueprint",
        evidenceUsed: [],
      };
    }

    return {
      outcome: "no-action",
      policyId: REGENERATION_POLICY_ID,
      reason: "No finding attributed to the blueprint reached high severity",
      evidenceUsed: report.findings.map(
        (f) => `${f.category} (${f.attribution})`,
      ),
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
}
