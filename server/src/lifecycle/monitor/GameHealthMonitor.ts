/**
 * GameHealthMonitor.ts
 *
 * Records lifecycle signals over time and assesses them under a named policy.
 *
 * SIM-TRUTH-1. This used to accept four numbers and always return an answer.
 * `retentionSimulated` was `engagement*0.5 + economyStability*0.3 +
 * npcDiversity*0.2` — a retention claim about a game nobody played, built from
 * a simulation score that measured nothing. `overall` weighted five values by
 * hand, and `trend` reported `stable` on the first reading, when there was
 * nothing to compare against.
 *
 * The caller supplied `?? 70` for every missing input, so a game with no
 * evidence at all was assessed at `overall` 73 with `retentionSimulated` 70 —
 * a passing result produced entirely by defaults. An assessment is now returned
 * only when the inputs it needs are present and server-produced; otherwise the
 * monitor reports insufficient evidence and names what was missing.
 */

/** The rule that combines present signals, named and versioned as policy. */
export const HEALTH_POLICY_ID = "lifecycle-signals-v1";

/**
 * One lifecycle signal.
 *
 * `null` means the signal was not produced. It is never replaced by a number.
 */
export interface HealthSignals {
  /** Server-produced simulation evidence. Never a client-supplied claim. */
  simulationEvidence: number | null;
  economyHealth: number | null;
  worldStability: number | null;
  anomalyRate: number | null;
}

export interface HealthAssessed {
  readonly status: "assessed";
  readonly policyId: typeof HEALTH_POLICY_ID;
  gameId: string;
  readonly signals: HealthSignals;
  /** Weighted only over signals that were present, with the weights recorded. */
  readonly composite: number;
  readonly weights: Readonly<Record<string, number>>;
  /** `null` until a previous assessment exists to compare against. */
  readonly trend: "improving" | "stable" | "declining" | null;
  timestamp: Date;
}

export interface HealthInsufficient {
  readonly status: "insufficient-evidence";
  readonly policyId: typeof HEALTH_POLICY_ID;
  gameId: string;
  readonly signals: HealthSignals;
  /** Which required signals were absent. */
  readonly missing: string[];
  readonly reason: string;
  timestamp: Date;
}

export type HealthAssessment = HealthAssessed | HealthInsufficient;

export function isAssessed(
  assessment: HealthAssessment,
): assessment is HealthAssessed {
  return assessment.status === "assessed";
}

/**
 * Signals the policy requires before it will assess at all.
 *
 * `anomalyRate` is deliberately not required: it is a negative signal whose
 * absence does not mean a problem, and it is weighted only when present.
 */
const REQUIRED_SIGNALS: ReadonlyArray<keyof HealthSignals> = [
  "simulationEvidence",
  "economyHealth",
  "worldStability",
];

const SIGNAL_WEIGHTS: Readonly<Record<string, number>> = {
  simulationEvidence: 0.4,
  economyHealth: 0.3,
  worldStability: 0.2,
  anomalyInverse: 0.1,
};

export class GameHealthMonitor {
  private history = new Map<string, HealthAssessed[]>();

  /**
   * Assess a game from whatever signals were produced.
   *
   * Returns `insufficient-evidence` when a required signal is absent. Nothing
   * is substituted for a missing input, and an insufficient result is not
   * recorded in history, so it can never become the baseline a later trend is
   * measured against.
   */
  assess(gameId: string, signals: HealthSignals): HealthAssessment {
    const missing = REQUIRED_SIGNALS.filter(
      (key) => signals[key] === null || signals[key] === undefined,
    ).map(String);

    if (missing.length > 0) {
      return {
        status: "insufficient-evidence",
        policyId: HEALTH_POLICY_ID,
        gameId,
        signals,
        missing,
        reason: `No health can be stated: ${missing.join(", ")} ${missing.length === 1 ? "was" : "were"} not produced. Absent evidence is not a passing result.`,
        timestamp: new Date(),
      };
    }

    const anomaly = signals.anomalyRate;
    const parts: Array<[number, number]> = [
      [signals.simulationEvidence as number, SIGNAL_WEIGHTS.simulationEvidence],
      [signals.economyHealth as number, SIGNAL_WEIGHTS.economyHealth],
      [signals.worldStability as number, SIGNAL_WEIGHTS.worldStability],
    ];
    if (anomaly !== null && anomaly !== undefined) {
      parts.push([100 - anomaly, SIGNAL_WEIGHTS.anomalyInverse]);
    }
    const weightTotal = parts.reduce((sum, [, w]) => sum + w, 0);
    const composite = Math.round(
      parts.reduce((sum, [value, w]) => sum + value * w, 0) / weightTotal,
    );

    const previous = this.getLatest(gameId);
    let trend: HealthAssessed["trend"] = null;
    if (previous) {
      if (composite > previous.composite + 5) trend = "improving";
      else if (composite < previous.composite - 5) trend = "declining";
      else trend = "stable";
    }

    const assessment: HealthAssessed = {
      status: "assessed",
      policyId: HEALTH_POLICY_ID,
      gameId,
      signals,
      composite,
      weights: SIGNAL_WEIGHTS,
      trend,
      timestamp: new Date(),
    };

    this.record(assessment);
    return assessment;
  }

  private record(assessment: HealthAssessed): void {
    const existing = this.history.get(assessment.gameId) ?? [];
    existing.push(assessment);
    if (existing.length > 100) existing.shift();
    this.history.set(assessment.gameId, existing);
  }

  /**
   * Get the latest assessment for a game, or `null` when none was ever made.
   */
  getLatest(gameId: string): HealthAssessed | null {
    const history = this.history.get(gameId);
    return history?.[history.length - 1] ?? null;
  }

  getHistory(gameId: string): ReadonlyArray<HealthAssessed> {
    return this.history.get(gameId) ?? [];
  }

  /**
   * Whether a game needs intervention.
   *
   * `false` when nothing was ever assessed — that is "unknown", and this
   * question is asked to decide whether to act, so unknown must not read as a
   * reason to act on invented grounds.
   */
  needsIntervention(gameId: string): boolean {
    const latest = this.getLatest(gameId);
    return (
      latest !== null && (latest.composite < 50 || latest.trend === "declining")
    );
  }
}
