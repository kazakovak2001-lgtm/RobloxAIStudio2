/**
 * ContinuousEvolutionEngine.ts
 *
 * Evolves games over time within bounded constraints.
 * Introduces controlled variation, adapts to emergent behaviors,
 * and prevents stagnation.
 */

import type { RobloxGameBlueprint } from "../../generation/blueprint/GameBlueprintEngine";
import type { LivePatch } from "../live/LiveUpdateEngine";

export interface EvolutionConfig {
  maxPatchesPerCycle: number;
  variationStrength: number; // 0–1 (how aggressive changes are)
  preventStagnationAfterTicks: number;
}

export interface EvolutionResult {
  gameId: string;
  patches: LivePatch[];
  evolutionType: "diversify" | "optimize" | "stabilize" | "expand";
  reason: string;
}

const DEFAULT_CONFIG: EvolutionConfig = {
  maxPatchesPerCycle: 3,
  variationStrength: 0.3,
  preventStagnationAfterTicks: 50,
};

export class ContinuousEvolutionEngine {
  private config: EvolutionConfig;
  private evolutionCounter = 0;

  constructor(config?: Partial<EvolutionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate evolution patches for a game based on its current state.
   */
  evolve(
    blueprint: RobloxGameBlueprint,
    healthScore: number,
    tickCount: number,
    stagnationDetected: boolean,
  ): EvolutionResult {
    this.evolutionCounter++;
    const patches: LivePatch[] = [];
    let evolutionType: EvolutionResult["evolutionType"];
    let reason: string;

    if (healthScore < 40) {
      // Stabilize — game is struggling
      evolutionType = "stabilize";
      reason = "Health critical — stabilizing core systems";
      patches.push(...this.stabilizePatches(blueprint));
    } else if (
      stagnationDetected ||
      tickCount > this.config.preventStagnationAfterTicks
    ) {
      // Diversify — prevent player boredom
      evolutionType = "diversify";
      reason = "Stagnation detected — introducing variety";
      patches.push(...this.diversifyPatches(blueprint));
    } else if (healthScore > 80) {
      // Expand — game is thriving, add content
      evolutionType = "expand";
      reason = "Game healthy — expanding content";
      patches.push(...this.expandPatches(blueprint));
    } else {
      // Optimize — incremental improvements
      evolutionType = "optimize";
      reason = "Standard optimization cycle";
      patches.push(...this.optimizePatches(blueprint));
    }

    // Cap patches per cycle
    const cappedPatches = patches.slice(0, this.config.maxPatchesPerCycle);

    console.log(
      `[EVOLUTION] Cycle ${this.evolutionCounter} | Type: ${evolutionType} | Patches: ${cappedPatches.length} | Health: ${healthScore}`,
    );

    return {
      gameId: blueprint.id,
      patches: cappedPatches,
      evolutionType,
      reason,
    };
  }

  private stabilizePatches(_bp: RobloxGameBlueprint): LivePatch[] {
    return [
      {
        id: `evo-stab-${this.evolutionCounter}`,
        target: "economy.sources[0].amount",
        action: "increment",
        value: 5,
        reason: "Increase base reward to stabilize early gameplay",
        timestamp: new Date(),
      },
    ];
  }

  private diversifyPatches(_bp: RobloxGameBlueprint): LivePatch[] {
    const newMechanic = `dynamic_event_${this.evolutionCounter}`;
    return [
      {
        id: `evo-div-${this.evolutionCounter}`,
        target: "mechanics",
        action: "append",
        value: newMechanic,
        reason: "Add variety to prevent stagnation",
        timestamp: new Date(),
      },
    ];
  }

  private expandPatches(_bp: RobloxGameBlueprint): LivePatch[] {
    return [
      {
        id: `evo-exp-${this.evolutionCounter}`,
        target: "world.biomes",
        action: "append",
        value: `expansion_zone_${this.evolutionCounter}`,
        reason: "Expand world with new zone (game is thriving)",
        timestamp: new Date(),
      },
    ];
  }

  private optimizePatches(_bp: RobloxGameBlueprint): LivePatch[] {
    return [
      {
        id: `evo-opt-${this.evolutionCounter}`,
        target: "economy.sinks[0].cost",
        action: "increment",
        value: -2,
        reason: "Slightly reduce upgrade cost for better flow",
        timestamp: new Date(),
      },
    ];
  }
}
