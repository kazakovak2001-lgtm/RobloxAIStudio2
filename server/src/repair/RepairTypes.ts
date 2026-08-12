/**
 * Repair Types — AI Self-Repair & Iteration Engine types.
 */

export type RepairStrategy =
  | "regenerate_script"
  | "update_asset_manifest"
  | "repair_dependency_graph"
  | "move_script"
  | "create_remote_event"
  | "create_module_script"
  | "regenerate_ui"
  | "regenerate_configuration"
  | "fix_asset_reference"
  | "ignore"
  | "escalate";

export type RepairDecision = "repair" | "regenerate" | "ignore" | "escalate";

import type { NoveltyVerdictRecord } from "../types/novelty";

import type { FindingCounts } from "../playtest";

/** No findings at all — the starting point before anything has been analysed. */
export const EMPTY_FINDING_COUNTS: FindingCounts = {
  critical: 0,
  warning: 0,
  suggestion: 0,
  optimization: 0,
  total: 0,
};

export interface RepairPlanItem {
  issueId: string;
  severity: string;
  targetArtifact: string;
  repairStrategy: RepairStrategy;
  estimatedImpact: number;
  priority: number;
  decision: RepairDecision;
  /** Carried over from the source PlaytestIssue so executors can target the real finding. */
  reason: string;
  recommendedFix: string;
}

export interface RepairPlan {
  projectId: string;
  iteration: number;
  items: RepairPlanItem[];
  /** Findings the plan was built from. Counts, never a grade. */
  findingCounts: FindingCounts;
  createdAt: number;
}

export interface RepairResult {
  planItem: RepairPlanItem;
  applied: boolean;
  artifactChanged: string;
  description: string;
}

/**
 * Version of the repair evidence contract a record was written under.
 *
 * PLAYTEST-TRUTH-1. A record without it predates this slice and carries
 * `scoreBefore` and `scoreAfter` from the old heuristic. Those numbers are
 * readable and are never a measurement of anything.
 */
export const REPAIR_EVIDENCE_VERSION = 2;

/** Everything an iteration record carries regardless of when it was written. */
interface RepairIterationBase {
  iteration: number;
  changedArtifacts: string[];
  duration: number;
  /** Not tracked yet — the LLM provider interface surfaces no usage metadata. */
  tokenUsage: number;
  /** Not tracked yet — see tokenUsage. */
  aiCost: number;
  repairsApplied: number;
  timestamp: number;
  /** New execution ID the repaired artifacts were persisted under, if any were applied. */
  newExecutionId?: string;
  /** Execution ID the repair was attempted against; artifacts there are never mutated. */
  parentExecutionId: string;
  /**
   * NOVELTY-2. Whether the repaired execution repeats a structure the project
   * has produced before.
   *
   * Recorded here because a repaired execution has no `GenerationExecution`
   * row to carry it — `RepairEngine` writes artifacts and this session record,
   * and nothing else. Without it the `repair-preserved` verdict could never be
   * reached in production, which review caught.
   *
   * `undefined` when no fingerprint was produced or the verdict could not be
   * formed. Absence means the question was not answered, never that the
   * repaired run was found distinct.
   */
  novelty?: NoveltyVerdictRecord;
  strategyResults: RepairResult[];
}

/**
 * An iteration written before PLAYTEST-TRUTH-1.
 *
 * It carries the heuristic totals and no finding counts. Those numbers came
 * from an average that added five points when the source contained `pcall`, so
 * a repair could appear to improve a game without resolving a single finding.
 * **Never read as a measurement, and never compared to decide anything.**
 */
export interface LegacyRepairIteration extends RepairIterationBase {
  scoreBefore?: number;
  scoreAfter?: number;
  findingsBefore?: undefined;
  findingsAfter?: undefined;
}

/** An iteration written by PLAYTEST-TRUTH-1 onward: findings, never scores. */
export interface EvidenceVersionedRepairIteration extends RepairIterationBase {
  findingsBefore: FindingCounts;
  findingsAfter: FindingCounts;
  scoreBefore?: undefined;
  scoreAfter?: undefined;
}

export type RepairIterationRecord =
  LegacyRepairIteration | EvidenceVersionedRepairIteration;

/** Everything a session carries regardless of when it was written. */
interface RepairSessionBase {
  projectId: string;
  status: "running" | "completed" | "stopped" | "timeout";
  currentIteration: number;
  maxIterations: number;
  history: RepairIterationRecord[];
  /** Absent on sessions persisted before REPAIR-1C — always read via `?? []`. */
  deliveries?: RepairDeliveryRecord[];
  startedAt: number;
  finishedAt?: number;
  totalRepairs: number;
  stopReason?: string;
}

/**
 * A session written before PLAYTEST-TRUTH-1.
 *
 * `targetScore` was compared against `currentScore` to decide whether to repair
 * and to declare a session complete; neither measured anything. These rows stay
 * readable and are never rewritten.
 *
 * `findingCounts` is typed as absent rather than optional-on-one-type because
 * a legacy row genuinely has no findings recorded. Absence is not zero
 * findings: it means the question was never asked, and a consumer that treats
 * it as `{ total: 0 }` would report a clean repair that never ran.
 */
export interface LegacyRepairSession extends RepairSessionBase {
  evidenceVersion?: undefined;
  findingCounts?: undefined;
  targetScore?: number;
  currentScore?: number;
}

/**
 * A session written by PLAYTEST-TRUTH-1 onward.
 *
 * The evidence fields this slice claims are required here, so a new row cannot
 * be persisted without them, and the heuristic fields are typed away so one
 * cannot reappear.
 */
export interface EvidenceVersionedRepairSession extends RepairSessionBase {
  evidenceVersion: typeof REPAIR_EVIDENCE_VERSION;
  /** Findings outstanding, which is what new sessions decide on. */
  findingCounts: FindingCounts;
  targetScore?: undefined;
  currentScore?: undefined;
}

/**
 * Either shape, told apart by `evidenceVersion`.
 *
 * A single interface requiring `findingCounts` was wrong in both directions: it
 * let a typed consumer dereference a field that legacy rows do not have, and it
 * only type-checked because the persistence layer cast the value. The union
 * makes the read boundary narrow before it can reach the evidence fields.
 */
export type RepairSessionState =
  LegacyRepairSession | EvidenceVersionedRepairSession;

/**
 * Narrow a session read back out of storage.
 *
 * The store reads rows through an unchecked generic assertion, so this guard
 * cannot assume the row is well formed. It requires the evidence fields as well
 * as the version: a row that claims version 2 without `findingCounts` is not a
 * valid version-2 row, and the safe reading is the weaker one. Treating it as
 * legacy says only that no findings were recorded, which is true; trusting the
 * version alone would let a consumer dereference a field that is not there.
 */
export function isEvidenceVersionedRepairSession(
  session: RepairSessionState,
): session is EvidenceVersionedRepairSession {
  return (
    session.evidenceVersion === REPAIR_EVIDENCE_VERSION &&
    session.findingCounts !== undefined
  );
}

/** True for a row written before PLAYTEST-TRUTH-1. */
export function isLegacyRepairSession(
  session: RepairSessionState,
): session is LegacyRepairSession {
  return !isEvidenceVersionedRepairSession(session);
}

/** One Studio delivery attempt — a fresh push of the latest repair, or an
 * explicit rollback to an earlier execution. Recorded whether it succeeded
 * or failed. */
export interface RepairDeliveryRecord {
  timestamp: number;
  executionId: string;
  studioId: string;
  source: "latest-repair" | "explicit-rollback";
  success: boolean;
  error?: string;
}

export interface RepairConfig {
  /** Hard ceiling on iterations. Independent of any quality judgement. */
  maxIterations: number;
  /**
   * Accepted and ignored.
   *
   * PLAYTEST-TRUTH-1 removed the comparison this drove. Callers already pass
   * it — the repair routes and existing tests — so it stays accepted rather
   * than breaking them, and it decides nothing. A session stops on findings,
   * the attempt ceiling, or the timeout.
   */
  targetScore?: number;
  timeoutMs: number;
}

export const DEFAULT_REPAIR_CONFIG: RepairConfig = {
  maxIterations: 5,
  timeoutMs: 120_000,
};
