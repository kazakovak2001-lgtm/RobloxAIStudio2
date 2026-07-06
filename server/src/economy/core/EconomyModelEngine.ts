/**
 * EconomyModelEngine.ts
 *
 * Parses a GameBlueprint's economy section into a formal model.
 * Tracks currency flows, reward loops, and inflation pressure.
 */

import type { RobloxGameBlueprint } from "../../generation/blueprint/GameBlueprintEngine";

export interface CurrencyFlow {
  source: string;
  amount: number;
  frequency: number; // per 10 ticks
}

export interface CurrencySink {
  target: string;
  cost: number;
  repeatable: boolean;
}

export interface EconomyModel {
  blueprintId: string;
  currency: string;
  flows: CurrencyFlow[];
  sinks: CurrencySink[];
  netFlowPerTick: number;
  inflationPressure: number; // 0–1 (higher = more inflation risk)
  stabilityIndex: number; // 0–100
}

export class EconomyModelEngine {
  /**
   * Parse a GameBlueprint into a formal economy model.
   */
  parse(blueprint: RobloxGameBlueprint): EconomyModel {
    const currency = blueprint.economy.currency;

    // Model flows from sources
    const flows: CurrencyFlow[] = blueprint.economy.sources.map(
      (source, i) => ({
        source,
        amount: 10 + i * 5, // heuristic: escalating rewards
        frequency: 2 + i, // per 10 ticks
      }),
    );

    // Model sinks from costs
    const sinks: CurrencySink[] = blueprint.economy.sinks.map((sink, i) => ({
      target: sink,
      cost: 20 + i * 15, // heuristic: escalating costs
      repeatable: sink !== "unlocks",
    }));

    // Compute net flow
    const totalInflowPer10 = flows.reduce(
      (sum, f) => sum + f.amount * f.frequency,
      0,
    );
    const totalSinkCost = sinks.reduce(
      (sum, s) => sum + (s.repeatable ? s.cost * 0.5 : s.cost * 0.1),
      0,
    );
    const netFlowPerTick = (totalInflowPer10 - totalSinkCost) / 10;

    // Inflation pressure (0–1)
    const inflationPressure =
      totalSinkCost > 0
        ? Math.min(
            1,
            Math.max(0, (totalInflowPer10 - totalSinkCost) / totalInflowPer10),
          )
        : 0.8;

    // Stability index (0–100)
    const stabilityIndex = Math.round(
      (1 - inflationPressure) * 80 +
        (sinks.length > 2 ? 20 : sinks.length * 10),
    );

    console.log(
      `[ECONOMY] Model parsed | Currency: ${currency} | Flows: ${flows.length} | Sinks: ${sinks.length} | Stability: ${stabilityIndex}`,
    );

    return {
      blueprintId: blueprint.id,
      currency,
      flows,
      sinks,
      netFlowPerTick: Math.round(netFlowPerTick * 100) / 100,
      inflationPressure: Math.round(inflationPressure * 100) / 100,
      stabilityIndex,
    };
  }
}
