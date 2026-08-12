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

/**
 * What this simulator's own scheduling could reach, independent of the game.
 *
 * SIM-TRUTH-1. The walk visits mechanics on a fixed stride of three ticks and
 * NPCs on a stride of five, indexing by `tick % count`. When the count shares a
 * factor with the stride, the walk provably cannot reach the rest: a blueprint
 * declaring three mechanics has one reachable, and one declaring five NPCs has
 * one reachable, however good the game is.
 *
 * Recorded so a consumer can tell a shortfall the blueprint caused from a
 * shortfall this schedule caused. Without it, "only 20% of NPCs were
 * interacted with" reads as a defect in the game when it is a property of the
 * loop above. Descriptive only — the schedule itself is unchanged.
 */
export interface SimulationSchedule {
  readonly mechanicStride: number;
  readonly npcStride: number;
  readonly currencyStride: number;
  readonly mechanicsDeclared: number;
  readonly npcsDeclared: number;
  /** Distinct mechanics this run's stride could index at all. */
  readonly mechanicsReachable: number;
  /** Distinct NPCs this run's stride could index at all. */
  readonly npcsReachable: number;
}

export interface SimulationResult {
  blueprintId: string;
  totalTicks: number;
  finalState: SimulationState;
  events: SimulationEvent[];
  completed: boolean;
  durationMs: number;
  /** SIM-TRUTH-1 provenance. See `SimulationSchedule`. */
  readonly schedule: SimulationSchedule;
}

const MECHANIC_STRIDE = 3;
const NPC_STRIDE = 5;
const CURRENCY_STRIDE = 4;

/**
 * Count the distinct entries a stride can reach in a run of `ticks` ticks.
 *
 * Enumerated rather than derived from a gcd identity, so the number is exactly
 * what the loop below does, including a run too short to complete a cycle.
 *
 * Counted by identity rather than by index, because the simulator records
 * mechanics in a `Set` keyed by name: a blueprint declaring the same mechanic
 * twice has two reachable indices but only one reachable mechanic, and
 * comparing an index ceiling against a name count would understate reach and
 * raise a finding against the blueprint for it.
 */
function reachableEntryCount(
  ticks: number,
  stride: number,
  entries: readonly string[],
): number {
  if (entries.length <= 0) return 0;
  const reached = new Set<string>();
  for (let t = 0; t < ticks; t += stride)
    reached.add(entries[t % entries.length]);
  return reached.size;
}

export class GameSimulationEngine {
  /**
   * Run a full game simulation on a blueprint.
   */
  simulateGame(blueprint: RobloxGameBlueprint, ticks = 100): SimulationResult {
    const start = Date.now();
    const state = this.initState(blueprint);

    let executed = 0;
    for (let t = 0; t < ticks; t++) {
      state.tick = t;
      this.runTick(state, blueprint);
      executed = t + 1;

      // Early exit if player disengages
      if (!state.playerState.engaged && t > 10) break;
    }

    // Ticks actually executed, not the last index plus one: a run of zero
    // ticks executed nothing, and reporting it as one tick made the schedule
    // claim the first mechanic was reachable when the loop never ran.
    const totalTicks = executed;
    const mechanicNames = blueprint.mechanics.map(String);
    const npcIds = blueprint.npcs.map((n) => String(n.id));
    const result: SimulationResult = {
      blueprintId: blueprint.id,
      totalTicks,
      finalState: state,
      events: state.events,
      completed: state.loopProgress >= 1.0,
      durationMs: Date.now() - start,
      schedule: {
        mechanicStride: MECHANIC_STRIDE,
        npcStride: NPC_STRIDE,
        currencyStride: CURRENCY_STRIDE,
        mechanicsDeclared: new Set(mechanicNames).size,
        npcsDeclared: new Set(npcIds).size,
        mechanicsReachable: reachableEntryCount(
          totalTicks,
          MECHANIC_STRIDE,
          mechanicNames,
        ),
        npcsReachable: reachableEntryCount(totalTicks, NPC_STRIDE, npcIds),
      },
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

    // Loop progress. Divided by the number of *distinct* mechanics, because
    // `mechanicsUsed` is a set of names: a blueprint declaring the same
    // mechanic twice could otherwise never reach 1.0, and the loop would be
    // reported as never completing for a game that exercised all of them.
    const distinctMechanics = new Set(blueprint.mechanics).size;
    const mechanicsCoverage =
      state.mechanicsUsed.size / Math.max(distinctMechanics, 1);
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
