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
 * `reachable` is what the stride could have reached at all.
 */
export interface ReachRatio {
  readonly exercised: number;
  readonly declared: number;
  readonly reachable: number;
  /** `exercised / declared`, or `null` when nothing was declared. */
  readonly ofDeclared: number | null;
  /** `exercised / reachable`, or `null` when the schedule could reach nothing. */
  readonly ofReachable: number | null;
  /**
   * The schedule's ceiling sits below what the blueprint declared.
   *
   * States only that, and deliberately not "the shortfall is excusable": a run
   * can also fall short of the ceiling, and a consumer reading this as "not the
   * blueprint's fault" would excuse that too. Compare `exercised` against
   * `reachable` to separate the two.
   */
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
      // Three distinct causes, and only one of them is the simulator's.
      // Declaring no mechanics at all is a property of the blueprint: the
      // stride reached everything there was to reach, so blaming the schedule
      // would assert something untrue about it.
      const declaredNothing = schedule.mechanicsDeclared === 0;
      const scheduleCannotComplete =
        !declaredNothing &&
        schedule.mechanicsReachable < schedule.mechanicsDeclared;
      findings.push({
        severity: "high",
        category: "broken-loop",
        description: declaredNothing
          ? "Core gameplay loop was never completed during simulation, because the blueprint declares no mechanics for it to complete"
          : scheduleCannotComplete
            ? "Core gameplay loop was never completed during simulation, and this simulator's stride could not reach every declared mechanic, so the loop could not complete regardless of the blueprint"
            : "Core gameplay loop was never completed during simulation",
        attribution: scheduleCannotComplete
          ? "simulator-schedule"
          : "blueprint",
      });
      if (!scheduleCannotComplete) {
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
        // ticks. That is the schedule's doing only when the stride could not
        // reach mechanics the blueprint declared; a blueprint declaring none is
        // the blueprint's own property.
        attribution:
          schedule.mechanicsDeclared > 0 &&
          schedule.mechanicsReachable < schedule.mechanicsDeclared
            ? "simulator-schedule"
            : "blueprint",
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
    // interacting with nothing.
    //
    // The shortfall is still reported, because it is real and a reader should
    // see it — but attributed to whichever cause actually produced it. With
    // this simulator the walk marks every NPC it indexes, so `exercised` equals
    // `reachable` and the schedule is always the cause; the blueprint branch is
    // kept because that identity is a property of the current loop and not of
    // the contract.
    if (npcReach.declared > 0 && npcsInteracted < npcReach.declared) {
      const scheduleExplains = npcsInteracted >= npcReach.reachable;
      findings.push({
        severity: "low",
        category: "dead-end",
        description: scheduleExplains
          ? `${npcsInteracted} of ${npcReach.declared} NPCs were interacted with, which is every NPC this simulation's stride could reach — the shortfall is this simulator's scheduling, not the blueprint`
          : `${npcsInteracted} of ${npcReach.declared} NPCs were interacted with, short of the ${npcReach.reachable} this simulation could reach`,
        attribution: scheduleExplains ? "simulator-schedule" : "blueprint",
      });
      if (!scheduleExplains) {
        suggestions.push(
          "Place NPCs closer to player paths or add quest markers",
        );
      }
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

const FINDING_SEVERITIES: readonly string[] = [
  "critical",
  "high",
  "medium",
  "low",
];
const FINDING_CATEGORIES: readonly string[] = [
  "friction",
  "broken-loop",
  "dead-end",
  "economy",
  "pacing",
];
const FINDING_ATTRIBUTIONS: readonly string[] = [
  "blueprint",
  "simulator-schedule",
  "indeterminate",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRatio(value: unknown): boolean {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isReachRatio(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value.exercised) &&
    isCount(value.declared) &&
    isCount(value.reachable) &&
    isRatio(value.ofDeclared) &&
    isRatio(value.ofReachable) &&
    typeof value.scheduleLimited === "boolean"
  );
}

function isFinding(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.severity === "string" &&
    FINDING_SEVERITIES.includes(value.severity) &&
    typeof value.category === "string" &&
    FINDING_CATEGORIES.includes(value.category) &&
    typeof value.description === "string" &&
    typeof value.attribution === "string" &&
    // Never optional: a finding whose cause is unstated cannot be acted on.
    FINDING_ATTRIBUTIONS.includes(value.attribution)
  );
}

/**
 * Decode a simulation evidence report that arrived from outside this process.
 *
 * `POST /api/simulate/feedback` accepts a report in the request body, so the
 * value reaching the feedback engine is whatever a caller sent. Before this
 * existed, a pre-slice report carrying `issues` and `engagementScore` reached
 * `report.findings.filter(...)` and threw, and a payload naming any version or
 * evidence kind was processed as deterministic simulation evidence.
 *
 * Strict about the version and the evidence kind, so a legacy record cannot be
 * promoted: its number was never a measurement and re-reading it as one here is
 * exactly what this slice removes. Strict about the rest of the shape because
 * the input is untrusted, and a partially-valid report would fail later at a
 * caller instead of here.
 */
export function decodeSimulationEvidenceReport(
  stored: unknown,
): SimulationEvidenceReport | null {
  if (!isRecord(stored)) return null;
  if (stored.schemaVersion !== SIMULATION_EVIDENCE_VERSION) return null;
  if (
    typeof stored.evidenceKind !== "string" ||
    !SIMULATION_EVIDENCE_KINDS.includes(
      stored.evidenceKind as SimulationEvidenceKind,
    )
  ) {
    return null;
  }
  if (typeof stored.blueprintId !== "string") return null;

  const observed = stored.observed;
  if (
    !isRecord(observed) ||
    !isCount(observed.totalTicks) ||
    !isCount(observed.mechanicsDeclared) ||
    !isCount(observed.mechanicsExercised) ||
    !isCount(observed.npcsDeclared) ||
    !isCount(observed.npcsInteracted) ||
    typeof observed.loopCompleteEventEmitted !== "boolean" ||
    !isCount(observed.frictionEvents) ||
    !isCount(observed.currencyGainEvents) ||
    !isCount(observed.levelUpEvents)
  ) {
    return null;
  }

  const derived = stored.derived;
  if (
    !isRecord(derived) ||
    !isReachRatio(derived.mechanicReach) ||
    !isReachRatio(derived.npcReach) ||
    typeof derived.loopCompleted !== "boolean"
  ) {
    return null;
  }

  const player = stored.player;
  if (
    !isRecord(player) ||
    player.status !== "not-observed" ||
    typeof player.reason !== "string" ||
    player.reason.length === 0
  ) {
    return null;
  }

  if (!Array.isArray(stored.findings) || !stored.findings.every(isFinding)) {
    return null;
  }
  if (
    !Array.isArray(stored.suggestions) ||
    !stored.suggestions.every((s) => typeof s === "string")
  ) {
    return null;
  }

  return stored as unknown as SimulationEvidenceReport;
}
