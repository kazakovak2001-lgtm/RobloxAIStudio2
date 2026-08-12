/**
 * PlaytestAgent.ts
 *
 * Reads a deterministic simulation run and reports what it observed.
 *
 * SIM-TRUTH-1. This used to report `engagementScore`, a 0–100 number named
 * after player engagement and produced by weighting four values from a
 * tick-driven script: `loopProgress*40 + mechanicsCoverage*30 + npcRate*15 +
 * (engaged ? 15 : 0)`. Nothing in that expression observed a player. Two of the
 * terms were the same quantity counted twice — the engine sets `loopProgress`
 * from the identical expression this file recomputed as `mechanicsCoverage` —
 * so one value carried seventy of the hundred points. `engaged` was initialised
 * to `true` and could only fall through a friction heuristic over that same
 * signal. A blueprint with no NPCs scored full marks for interacting with
 * nothing.
 *
 * No Roblox runtime ran, no place loaded, no player existed and no input was
 * simulated. The score is gone and nothing replaces it: what the run observed
 * is reported as observation, what is computed from it is reported as
 * derivation, and neither is offered as a measurement of engagement.
 */

import type { RobloxGameBlueprint } from "../../generation/blueprint/GameBlueprintEngine";
import type { SimulationResult } from "../core/GameSimulationEngine";

/** Bumped when the evidence shape changes. A payload on another version is refused. */
export const SIMULATION_EVIDENCE_VERSION = 1;

/**
 * What produced this evidence.
 *
 * A closed set with one member, and that is the point: a future real-runtime
 * source has to declare itself rather than inheriting the standing of a field
 * that never distinguished a simulation from a play session.
 */
export const SIMULATION_EVIDENCE_KINDS = ["deterministic-simulation"] as const;
export type SimulationEvidenceKind = (typeof SIMULATION_EVIDENCE_KINDS)[number];

export type FindingSeverity = "critical" | "high" | "medium" | "low";

/**
 * Where a finding's cause lies.
 *
 * `blueprint` — the game is responsible and the finding is about the game.
 * `simulator-schedule` — the simulator's own stride caused it, so it is not a
 * statement about the game at all.
 * `indeterminate` — the two cannot be separated from this run.
 */
export type FindingAttribution =
  "blueprint" | "simulator-schedule" | "indeterminate";

export interface SimulationFinding {
  severity: FindingSeverity;
  category: "friction" | "broken-loop" | "dead-end" | "economy" | "pacing";
  description: string;
  tick?: number;
  /** Never omitted: a finding without a cause cannot be acted on honestly. */
  attribution: FindingAttribution;
}

/**
 * Layer 1 — facts observed during the run.
 *
 * True of the simulation, and only of the simulation. Counts and events, no
 * ratios and no judgements.
 */
export interface SimulationObservations {
  readonly totalTicks: number;
  readonly mechanicsDeclared: number;
  readonly mechanicsExercised: number;
  readonly npcsDeclared: number;
  readonly npcsInteracted: number;
  readonly loopCompleteEventEmitted: boolean;
  readonly frictionEvents: number;
  readonly currencyGainEvents: number;
  readonly levelUpEvents: number;
}

/**
 * A ratio the simulator's own schedule bounds.
 *
 * `reachable` is what the stride could have indexed at all. When `exercised`
 * equals `reachable` and `reachable` is below `declared`, the shortfall is the
 * schedule's and says nothing about the game.
 */
export interface ReachRatio {
  readonly exercised: number;
  readonly declared: number;
  readonly reachable: number;
  /** `exercised / declared`, or `null` when nothing was declared. */
  readonly ofDeclared: number | null;
  /** `exercised / reachable`, or `null` when the schedule could reach nothing. */
  readonly ofReachable: number | null;
  /** True when the schedule, not the game, capped this ratio. */
  readonly scheduleLimited: boolean;
}

/**
 * Layer 2 — values computed from the observations.
 *
 * Labelled derived so none is read as a measurement. There is deliberately no
 * aggregate here: combining these into one number is what produced the claim
 * this slice removed.
 */
export interface SimulationDerivedIndicators {
  readonly mechanicReach: ReachRatio;
  readonly npcReach: ReachRatio;
  /**
   * Whether the run emitted `loop_complete`.
   *
   * The former `loopCompletionRate` was `mechanicsUsed.size / mechanics.length`
   * — the same value as `mechanicReach`, under a name implying a second,
   * independent signal. Only the event is reported now, because only the event
   * is separate information.
   */
  readonly loopCompleted: boolean;
}

/**
 * Whether a player was observed, which this platform cannot do.
 *
 * Present and explicit rather than absent, because an absent field reads as an
 * oversight and a zero reads as a failing grade. The question was never asked.
 */
export interface PlayerObservation {
  readonly status: "not-observed";
  readonly reason: string;
}

export const PLAYER_NOT_OBSERVED: PlayerObservation = {
  status: "not-observed",
  reason:
    "No player was observed. This report reads a deterministic tick-driven simulation of a blueprint; no Roblox runtime ran, no place loaded, no player existed and no input was simulated. Engagement, retention, fun, quality and balance are not measured here and cannot be inferred from it.",
};

export interface SimulationEvidenceReport {
  readonly schemaVersion: typeof SIMULATION_EVIDENCE_VERSION;
  readonly evidenceKind: SimulationEvidenceKind;
  blueprintId: string;
  readonly observed: SimulationObservations;
  readonly derived: SimulationDerivedIndicators;
  readonly player: PlayerObservation;
  findings: SimulationFinding[];
  suggestions: string[];
}

function reachRatio(
  exercised: number,
  declared: number,
  reachable: number,
): ReachRatio {
  return {
    exercised,
    declared,
    reachable,
    ofDeclared: declared > 0 ? exercised / declared : null,
    ofReachable: reachable > 0 ? exercised / reachable : null,
    scheduleLimited: declared > 0 && reachable < declared,
  };
}

export class PlaytestAgent {
  /**
   * Read a simulation run and report what it observed.
   */
  analyze(
    blueprint: RobloxGameBlueprint,
    simulation: SimulationResult,
  ): SimulationEvidenceReport {
    const findings: SimulationFinding[] = [];
    const suggestions: string[] = [];
    const events = simulation.events;
    const schedule = simulation.schedule;

    const loopComplete = events.some((e) => e.type === "loop_complete");
    if (!loopComplete) {
      // Attribution depends on whether the schedule could have completed it at
      // all: a blueprint the stride cannot fully index can never emit the
      // event, so the game is not what failed.
      const reachableAll =
        schedule.mechanicsDeclared > 0 &&
        schedule.mechanicsReachable >= schedule.mechanicsDeclared;
      findings.push({
        severity: "high",
        category: "broken-loop",
        description: reachableAll
          ? "Core gameplay loop was never completed during simulation"
          : "Core gameplay loop was never completed during simulation, and this simulator's stride could not index every declared mechanic, so the loop could not complete regardless of the blueprint",
        attribution: reachableAll ? "blueprint" : "simulator-schedule",
      });
      if (reachableAll) {
        suggestions.push("Simplify the core loop or add more discovery paths");
      }
    }

    const frictionEvents = events.filter((e) => e.type === "friction");
    for (const f of frictionEvents) {
      findings.push({
        severity: "medium",
        category: "friction",
        description: f.detail,
        tick: f.tick,
        // The friction rule fires when no mechanic was exercised in twenty
        // ticks, which the stride alone decides when nothing is reachable.
        attribution:
          schedule.mechanicsDeclared === 0 ? "simulator-schedule" : "blueprint",
      });
    }
    if (frictionEvents.length > 0) {
      suggestions.push(
        "Add variety to mid-game mechanics to prevent stale gameplay",
      );
    }

    const currencyGains = events.filter(
      (e) => e.type === "currency_gain",
    ).length;
    const levelUps = events.filter((e) => e.type === "level_up").length;
    if (currencyGains > 0 && levelUps === 0) {
      findings.push({
        severity: "medium",
        category: "economy",
        description:
          "Currency earned but no progression occurred — economy may be too slow",
        // Currency accrues on a fixed stride regardless of the blueprint, so
        // this comparison is between two simulator constants.
        attribution: "simulator-schedule",
      });
    }

    if (simulation.totalTicks < 20 && !loopComplete) {
      findings.push({
        severity: "high",
        category: "pacing",
        description:
          "Simulation ended early without completing the loop — the run was too short to exercise the blueprint",
        attribution: "indeterminate",
      });
    }

    const mechanicReach = reachRatio(
      simulation.finalState.mechanicsUsed.size,
      schedule.mechanicsDeclared,
      schedule.mechanicsReachable,
    );
    const npcsInteracted = simulation.finalState.npcStates.filter(
      (n) => n.interacted,
    ).length;
    const npcReach = reachRatio(
      npcsInteracted,
      schedule.npcsDeclared,
      schedule.npcsReachable,
    );

    // The former rule read `npcRate < 0.5` over `interacted / declared`, with
    // `declared === 0` scored as a perfect 1. It asserted a dead end in the
    // game for a shortfall the stride had already fixed, and awarded credit for
    // interacting with nothing. It now fires only when the run reached fewer
    // NPCs than this schedule could have reached.
    if (
      npcReach.declared > 0 &&
      npcReach.ofReachable !== null &&
      npcReach.ofReachable < 0.5
    ) {
      findings.push({
        severity: "low",
        category: "dead-end",
        description: `Only ${npcsInteracted} of the ${npcReach.reachable} NPCs this simulation could reach were interacted with`,
        attribution: "blueprint",
      });
      suggestions.push(
        "Place NPCs closer to player paths or add quest markers",
      );
    }

    return {
      schemaVersion: SIMULATION_EVIDENCE_VERSION,
      evidenceKind: "deterministic-simulation",
      blueprintId: blueprint.id,
      observed: {
        totalTicks: simulation.totalTicks,
        mechanicsDeclared: schedule.mechanicsDeclared,
        mechanicsExercised: simulation.finalState.mechanicsUsed.size,
        npcsDeclared: schedule.npcsDeclared,
        npcsInteracted,
        loopCompleteEventEmitted: loopComplete,
        frictionEvents: frictionEvents.length,
        currencyGainEvents: currencyGains,
        levelUpEvents: levelUps,
      },
      derived: {
        mechanicReach,
        npcReach,
        loopCompleted: loopComplete,
      },
      player: PLAYER_NOT_OBSERVED,
      findings,
      suggestions,
    };
  }
}
