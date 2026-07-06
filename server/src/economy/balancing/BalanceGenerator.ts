/**
 * BalanceGenerator.ts
 *
 * Generates corrective adjustments to fix detected economy imbalances.
 * Outputs a patch plan for blueprint updates.
 */

import type {
  Imbalance,
  ImbalanceReport,
} from "../detection/ImbalanceDetector";

export interface BalanceAdjustment {
  target: string;
  field: string;
  action: "increase" | "decrease" | "add" | "remove" | "scale";
  factor: number;
  reason: string;
}

export interface BalancePatch {
  blueprintId: string;
  adjustments: BalanceAdjustment[];
  estimatedImpact: string;
  confidence: number; // 0–1
}

export class BalanceGenerator {
  /**
   * Generate corrective balance adjustments from an imbalance report.
   */
  generate(report: ImbalanceReport): BalancePatch {
    const adjustments: BalanceAdjustment[] = [];

    for (const imbalance of report.imbalances) {
      adjustments.push(...this.resolveImbalance(imbalance));
    }

    const confidence =
      adjustments.length > 0
        ? Math.max(0.3, 1 - adjustments.length * 0.1)
        : 1.0;

    const impact =
      adjustments.length === 0
        ? "No changes needed"
        : `${adjustments.length} adjustments targeting: ${[...new Set(adjustments.map((a) => a.target))].join(", ")}`;

    console.log(
      `[BALANCE] Patch generated | Adjustments: ${adjustments.length} | Confidence: ${Math.round(confidence * 100)}%`,
    );

    return {
      blueprintId: report.blueprintId,
      adjustments,
      estimatedImpact: impact,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  private resolveImbalance(imbalance: Imbalance): BalanceAdjustment[] {
    switch (imbalance.type) {
      case "inflation":
        return [
          {
            target: "economy.sources",
            field: "amount",
            action: "decrease",
            factor: 0.7,
            reason: "Reduce reward amounts to curb inflation",
          },
          {
            target: "economy.sinks",
            field: "cost",
            action: "decrease",
            factor: 0.85,
            reason: "Slightly reduce costs to maintain engagement",
          },
        ];

      case "bottleneck":
        return [
          {
            target: "economy.sources",
            field: "amount",
            action: "increase",
            factor: 1.3,
            reason: "Increase early-game rewards to clear bottleneck",
          },
          {
            target: "progression.stages",
            field: "threshold",
            action: "decrease",
            factor: 0.8,
            reason: "Lower progression thresholds",
          },
        ];

      case "starvation":
        return [
          {
            target: "economy.sources",
            field: "amount",
            action: "increase",
            factor: 1.5,
            reason: "Significantly increase rewards to combat starvation",
          },
          {
            target: "economy.sources",
            field: "frequency",
            action: "increase",
            factor: 1.2,
            reason: "Increase reward frequency",
          },
        ];

      case "exploit-loop":
        return [
          {
            target: "economy.sinks",
            field: "count",
            action: "add",
            factor: 2,
            reason: "Add more currency sinks to prevent exploit accumulation",
          },
          {
            target: "economy.sources",
            field: "amount",
            action: "scale",
            factor: 0.8,
            reason: "Cap maximum earn rate",
          },
        ];

      case "broken-curve":
        return [
          {
            target: "progression.stages",
            field: "threshold",
            action: "decrease",
            factor: 0.6,
            reason: "Dramatically lower first level-up cost",
          },
          {
            target: "economy.sources",
            field: "amount",
            action: "increase",
            factor: 1.2,
            reason: "Boost early currency",
          },
        ];

      default:
        return [];
    }
  }
}
