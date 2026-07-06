/**
 * ImbalanceDetector.ts
 *
 * Detects specific economy problems from simulation results.
 */

import type { EconomySimulationResult } from "../simulation/EconomySimulationEngine";
import type { EconomyModel } from "../core/EconomyModelEngine";

export interface Imbalance {
  type:
    "inflation" | "bottleneck" | "starvation" | "exploit-loop" | "broken-curve";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  data: Record<string, unknown>;
}

export interface ImbalanceReport {
  blueprintId: string;
  imbalances: Imbalance[];
  healthScore: number; // 0–100
  critical: number;
  actionRequired: boolean;
}

export class ImbalanceDetector {
  /**
   * Analyze simulation result for economy imbalances.
   */
  detect(
    model: EconomyModel,
    simulation: EconomySimulationResult,
  ): ImbalanceReport {
    const imbalances: Imbalance[] = [];

    // Inflation detection
    if (simulation.exponentialGrowth) {
      imbalances.push({
        type: "inflation",
        severity: "critical",
        description: `Exponential currency growth detected (${simulation.growthRate}% growth rate)`,
        data: {
          growthRate: simulation.growthRate,
          peak: simulation.peakBalance,
        },
      });
    } else if (simulation.growthRate > 100) {
      imbalances.push({
        type: "inflation",
        severity: "high",
        description: `High inflation pressure: ${simulation.growthRate}% growth`,
        data: { growthRate: simulation.growthRate },
      });
    }

    // Bottleneck detection
    if (simulation.bottleneckTick !== null) {
      imbalances.push({
        type: "bottleneck",
        severity: "high",
        description: `Progression bottleneck at tick ${simulation.bottleneckTick} — player cannot afford upgrades`,
        data: { tick: simulation.bottleneckTick },
      });
    }

    // Reward starvation
    if (simulation.stagnationDetected) {
      imbalances.push({
        type: "starvation",
        severity: "medium",
        description: "Economy stagnation: low growth and low balances",
        data: {
          avgBalance: simulation.averageBalance,
          growthRate: simulation.growthRate,
        },
      });
    }

    // Exploit loop (net flow too positive with no sinks consuming)
    if (model.netFlowPerTick > 20 && model.sinks.length < 2) {
      imbalances.push({
        type: "exploit-loop",
        severity: "high",
        description: `Net flow ${model.netFlowPerTick}/tick with only ${model.sinks.length} sinks — exploit risk`,
        data: { netFlow: model.netFlowPerTick, sinks: model.sinks.length },
      });
    }

    // Broken upgrade curve (level stays at 1 for too long)
    const levelHistory = simulation.history.map((h) => h.level);
    const ticksAtLevel1 = levelHistory.filter((l) => l === 1).length;
    if (ticksAtLevel1 > simulation.ticks * 0.7) {
      imbalances.push({
        type: "broken-curve",
        severity: "medium",
        description: `Player stayed at level 1 for ${Math.round((ticksAtLevel1 / simulation.ticks) * 100)}% of simulation`,
        data: { ticksAtLevel1, totalTicks: simulation.ticks },
      });
    }

    const critical = imbalances.filter((i) => i.severity === "critical").length;
    const high = imbalances.filter((i) => i.severity === "high").length;
    const healthScore = Math.max(
      0,
      100 - critical * 30 - high * 15 - imbalances.length * 5,
    );

    console.log(
      `[IMBALANCE] Report | Health: ${healthScore} | Issues: ${imbalances.length} | Critical: ${critical}`,
    );

    return {
      blueprintId: model.blueprintId,
      imbalances,
      healthScore,
      critical,
      actionRequired: critical > 0 || high > 1,
    };
  }
}
