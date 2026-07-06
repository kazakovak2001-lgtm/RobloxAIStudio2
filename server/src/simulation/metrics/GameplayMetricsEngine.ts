/**
 * GameplayMetricsEngine.ts
 *
 * Extracts structured gameplay metrics from simulation results.
 */

import type { SimulationResult } from "../core/GameSimulationEngine";

export interface GameplayMetrics {
  blueprintId: string;
  completionRate: number; // 0–1
  dropOffTick: number | null; // tick where player disengaged, or null if stayed
  loopEngagementScore: number; // 0–100
  economyStability: number; // 0–100
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

    // Drop-off point
    const dropOffEvent = events.find(
      (e) => e.type === "drop_off" || e.type === "friction",
    );
    const dropOffTick = !state.playerState.engaged
      ? (dropOffEvent?.tick ?? simulation.totalTicks)
      : null;

    // Economy stability: ratio of gains to level-ups
    const gains = events.filter((e) => e.type === "currency_gain").length;
    const levelUps = events.filter((e) => e.type === "level_up").length;
    const economyStability =
      gains > 0
        ? Math.min(100, Math.round((levelUps / (gains * 0.1)) * 100))
        : 50;

    // NPC interaction frequency
    const npcInteractions = events.filter(
      (e) => e.type === "npc_interact",
    ).length;
    const npcFrequency =
      simulation.totalTicks > 0
        ? (npcInteractions / simulation.totalTicks) * 10
        : 0;

    // Loop engagement
    const loopEngagement = Math.round(state.loopProgress * 100);

    // Mechanics discovery rate
    const mechanicsDiscovery =
      state.mechanicsUsed.size > 0
        ? state.mechanicsUsed.size /
          Math.max(events.filter((e) => e.type === "mechanic_used").length, 1)
        : 0;

    return {
      blueprintId: simulation.blueprintId,
      completionRate: state.loopProgress,
      dropOffTick,
      loopEngagementScore: loopEngagement,
      economyStability,
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
