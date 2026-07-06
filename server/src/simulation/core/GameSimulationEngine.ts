/**
 * GameSimulationEngine.ts
 *
 * Simulates gameplay from a GameBlueprint without a real Roblox runtime.
 * Runs tick-based simulation with virtual player + NPC agents.
 * Deterministic: same blueprint + same seed → same metrics.
 */

import type { RobloxGameBlueprint } from "../../generation/blueprint/GameBlueprintEngine";

export interface SimulationState {
  tick: number;
  playerState: {
    position: string;
    level: number;
    currency: number;
    engaged: boolean;
  };
  npcStates: Array<{ id: string; active: boolean; interacted: boolean }>;
  mechanicsUsed: Set<string>;
  loopProgress: number; // 0–1 how far through the core loop
  events: SimulationEvent[];
}

export interface SimulationEvent {
  tick: number;
  type:
    | "mechanic_used"
    | "npc_interact"
    | "level_up"
    | "currency_gain"
    | "drop_off"
    | "loop_complete"
    | "friction";
  detail: string;
}

export interface SimulationResult {
  blueprintId: string;
  totalTicks: number;
  finalState: SimulationState;
  events: SimulationEvent[];
  completed: boolean;
  durationMs: number;
}

export class GameSimulationEngine {
  /**
   * Run a full game simulation on a blueprint.
   */
  simulateGame(blueprint: RobloxGameBlueprint, ticks = 100): SimulationResult {
    const start = Date.now();
    const state = this.initState(blueprint);

    for (let t = 0; t < ticks; t++) {
      state.tick = t;
      this.runTick(state, blueprint);

      // Early exit if player disengages
      if (!state.playerState.engaged && t > 10) break;
    }

    const result: SimulationResult = {
      blueprintId: blueprint.id,
      totalTicks: state.tick + 1,
      finalState: state,
      events: state.events,
      completed: state.loopProgress >= 1.0,
      durationMs: Date.now() - start,
    };

    console.log(
      `[SIMULATION] Complete | Blueprint: ${blueprint.id} | Ticks: ${result.totalTicks} | Completed: ${result.completed}`,
    );

    return result;
  }

  private initState(blueprint: RobloxGameBlueprint): SimulationState {
    return {
      tick: 0,
      playerState: { position: "spawn", level: 1, currency: 0, engaged: true },
      npcStates: blueprint.npcs.map((n) => ({
        id: n.id,
        active: true,
        interacted: false,
      })),
      mechanicsUsed: new Set(),
      loopProgress: 0,
      events: [],
    };
  }

  private runTick(
    state: SimulationState,
    blueprint: RobloxGameBlueprint,
  ): void {
    // Simulate player exploring mechanics
    if (blueprint.mechanics.length > 0 && state.tick % 3 === 0) {
      const mechIdx = state.tick % blueprint.mechanics.length;
      const mechanic = blueprint.mechanics[mechIdx];
      state.mechanicsUsed.add(mechanic);
      state.events.push({
        tick: state.tick,
        type: "mechanic_used",
        detail: mechanic,
      });
    }

    // Simulate NPC interactions
    if (state.tick % 5 === 0 && state.npcStates.length > 0) {
      const npcIdx = state.tick % state.npcStates.length;
      const npc = state.npcStates[npcIdx];
      if (!npc.interacted) {
        npc.interacted = true;
        state.events.push({
          tick: state.tick,
          type: "npc_interact",
          detail: npc.id,
        });
      }
    }

    // Simulate currency gain
    if (state.tick % 4 === 0) {
      state.playerState.currency += 10;
      state.events.push({
        tick: state.tick,
        type: "currency_gain",
        detail: "+10",
      });
    }

    // Simulate level progression
    if (state.playerState.currency >= state.playerState.level * 50) {
      state.playerState.level++;
      state.events.push({
        tick: state.tick,
        type: "level_up",
        detail: `Level ${state.playerState.level}`,
      });
    }

    // Loop progress
    const mechanicsCoverage =
      state.mechanicsUsed.size / Math.max(blueprint.mechanics.length, 1);
    state.loopProgress = Math.min(1.0, mechanicsCoverage);

    if (
      state.loopProgress >= 1.0 &&
      !state.events.some((e) => e.type === "loop_complete")
    ) {
      state.events.push({
        tick: state.tick,
        type: "loop_complete",
        detail: "Core loop completed",
      });
    }

    // Friction detection: if no new mechanics discovered in 20 ticks
    if (state.tick > 20 && state.tick % 20 === 0) {
      const recentMechanics = state.events.filter(
        (e) => e.type === "mechanic_used" && e.tick > state.tick - 20,
      );
      if (recentMechanics.length === 0) {
        state.events.push({
          tick: state.tick,
          type: "friction",
          detail: "No new mechanics discovered — stale gameplay",
        });
        state.playerState.engaged = false;
      }
    }
  }
}
