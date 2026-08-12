/**
 * GameplayMetricsEngine.ts
 *
 * Extracts structured metrics from a deterministic simulation run.
 *
 * SIM-TRUTH-1. Three fields here were not what their names said.
 * `completionRate` was `loopProgress`, which is the mechanic reach ratio under
 * a third name. `loopEngagementScore` was that same ratio times one hundred and
 * called engagement. `economyStability` compared two quantities the simulator
 * produces on fixed strides regardless of the blueprint, so it could not vary
 * with the game, and it fell back to a bare `50` when no currency was gained —
 * an invented middle reading for a question nothing had answered.
 *
 * Counts and event facts are kept. The ratios that restated one another are
 * gone, and a value that cannot be computed is now absent rather than filled in.
 */

import type { SimulationResult } from "../core/GameSimulationEngine";

export interface GameplayMetrics {
  blueprintId: string;
  /** Tick a friction or drop-off event fired, or `null` when none did. */
  dropOffTick: number | null;
  /**
   * Level-ups per currency gain.
   *
   * Both are produced by fixed strides that no blueprint influences, so this
   * describes the simulator and not the game's economy. `null` when no currency
   * was gained: absence means the question was not answered, never a middling
   * result.
   */
  economyProgressionRatio: number | null;
  npcInteractionFrequency: number; // interactions per 10 ticks
  mechanicsDiscoveryRate: number; // 0–1
  totalEvents: number;
  averageEventsPerTick: number;
  sessionLength: number; // ticks
}

export class GameplayMetricsEngine {
  /**
   * Extract metrics from a simulation result.
   */
  extract(simulation: SimulationResult): GameplayMetrics {
    const events = simulation.events;
    const state = simulation.finalState;

    const dropOffEvent = events.find(
      (e) => e.type === "drop_off" || e.type === "friction",
    );
    const dropOffTick = !state.playerState.engaged
      ? (dropOffEvent?.tick ?? simulation.totalTicks)
      : null;

    const gains = events.filter((e) => e.type === "currency_gain").length;
    const levelUps = events.filter((e) => e.type === "level_up").length;
    const economyProgressionRatio = gains > 0 ? levelUps / gains : null;

    const npcInteractions = events.filter(
      (e) => e.type === "npc_interact",
    ).length;
    const npcFrequency =
      simulation.totalTicks > 0
        ? (npcInteractions / simulation.totalTicks) * 10
        : 0;

    const mechanicsDiscovery =
      state.mechanicsUsed.size > 0
        ? state.mechanicsUsed.size /
          Math.max(events.filter((e) => e.type === "mechanic_used").length, 1)
        : 0;

    return {
      blueprintId: simulation.blueprintId,
      dropOffTick,
      economyProgressionRatio,
      npcInteractionFrequency: Math.round(npcFrequency * 100) / 100,
      mechanicsDiscoveryRate: Math.round(mechanicsDiscovery * 100) / 100,
      totalEvents: events.length,
      averageEventsPerTick:
        simulation.totalTicks > 0
          ? Math.round((events.length / simulation.totalTicks) * 100) / 100
          : 0,
      sessionLength: simulation.totalTicks,
    };
  }
}
