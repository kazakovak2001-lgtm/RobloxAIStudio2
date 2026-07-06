/**
 * EconomySimulationEngine.ts
 *
 * Simulates long-term economy behavior over many ticks.
 * Detects exponential growth, stagnation, and tipping points.
 */

import type { EconomyModel } from "../core/EconomyModelEngine";

export interface EconomyTick {
  tick: number;
  balance: number;
  earned: number;
  spent: number;
  level: number;
}

export interface EconomySimulationResult {
  blueprintId: string;
  ticks: number;
  history: EconomyTick[];
  finalBalance: number;
  peakBalance: number;
  averageBalance: number;
  growthRate: number; // % per 10 ticks
  stagnationDetected: boolean;
  exponentialGrowth: boolean;
  bottleneckTick: number | null;
}

export class EconomySimulationEngine {
  /**
   * Simulate economy over N ticks and analyze trends.
   */
  simulate(model: EconomyModel, ticks = 200): EconomySimulationResult {
    const history: EconomyTick[] = [];
    let balance = 0;
    let level = 1;
    let peakBalance = 0;
    let bottleneckTick: number | null = null;

    for (let t = 0; t < ticks; t++) {
      // Earn from all flows
      let earned = 0;
      for (const flow of model.flows) {
        if (t % Math.max(1, Math.round(10 / flow.frequency)) === 0) {
          earned += flow.amount * (1 + level * 0.1); // slight scaling with level
        }
      }

      // Spend on sinks (attempt to buy when affordable)
      let spent = 0;
      for (const sink of model.sinks) {
        const scaledCost = sink.cost * (1 + level * 0.2);
        if (balance >= scaledCost && (sink.repeatable || level < 5)) {
          spent += scaledCost;
          if (!sink.repeatable) level++;
        }
      }

      balance += earned - spent;
      if (balance > peakBalance) peakBalance = balance;

      // Detect bottleneck (can't afford anything for 20+ ticks)
      if (spent === 0 && earned > 0 && t > 20 && bottleneckTick === null) {
        const recentHistory = history.slice(-20);
        if (recentHistory.every((h) => h.spent === 0)) {
          bottleneckTick = t - 20;
        }
      }

      history.push({
        tick: t,
        balance: Math.round(balance),
        earned: Math.round(earned),
        spent: Math.round(spent),
        level,
      });
    }

    // Analyze trends
    const avgBalance =
      history.reduce((s, h) => s + h.balance, 0) / history.length;
    const firstHalf = history.slice(0, Math.floor(ticks / 2));
    const secondHalf = history.slice(Math.floor(ticks / 2));
    const firstAvg =
      firstHalf.reduce((s, h) => s + h.balance, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((s, h) => s + h.balance, 0) / secondHalf.length;
    const growthRate =
      firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

    const exponentialGrowth = growthRate > 200;
    const stagnationDetected = Math.abs(growthRate) < 5 && avgBalance < 50;

    console.log(
      `[ECON-SIM] Complete | Ticks: ${ticks} | Final: ${Math.round(balance)} | Growth: ${Math.round(growthRate)}% | Stable: ${!exponentialGrowth && !stagnationDetected}`,
    );

    return {
      blueprintId: model.blueprintId,
      ticks,
      history,
      finalBalance: Math.round(balance),
      peakBalance: Math.round(peakBalance),
      averageBalance: Math.round(avgBalance),
      growthRate: Math.round(growthRate),
      stagnationDetected,
      exponentialGrowth,
      bottleneckTick,
    };
  }
}
