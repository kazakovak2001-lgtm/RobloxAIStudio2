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

export interface RepairIterationRecord {
  iteration: number;
  changedArtifacts: string[];
  /**
   * Legacy heuristic totals, present only on records written before
   * PLAYTEST-TRUTH-1. They came from an average that added five points when
   * the source contained `pcall`, so a repair could appear to improve a game
   * without resolving a single finding. **Never read as a measurement, and
   * never compared to decide anything.**
   */
  scoreBefore?: number;
  scoreAfter?: number;
  /** Findings before and after this iteration. Absent on legacy records. */
  findingsBefore?: FindingCounts;
  findingsAfter?: FindingCounts;
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

export interface RepairSessionState {
  projectId: string;
  status: "running" | "completed" | "stopped" | "timeout";
  currentIteration: number;
  maxIterations: number;
  /**
   * Legacy heuristic values, present only on sessions written before
   * PLAYTEST-TRUTH-1. `targetScore` was compared against `currentScore` to
   * decide whether to repair and to declare a session complete; neither
   * measured anything. Kept readable, never written by new sessions.
   */
  targetScore?: number;
  currentScore?: number;
  /** Findings outstanding, which is what new sessions decide on. */
  findingCounts: FindingCounts;
  /** Absent on legacy sessions, which is how the two are told apart. */
  evidenceVersion?: number;
  history: RepairIterationRecord[];
  /** Absent on sessions persisted before REPAIR-1C — always read via `?? []`. */
  deliveries?: RepairDeliveryRecord[];
  startedAt: number;
  finishedAt?: number;
  totalRepairs: number;
  stopReason?: string;
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
