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
  targetScore: number;
  currentScore: number;
  createdAt: number;
}

export interface RepairResult {
  planItem: RepairPlanItem;
  applied: boolean;
  artifactChanged: string;
  description: string;
}

export interface RepairIterationRecord {
  iteration: number;
  changedArtifacts: string[];
  scoreBefore: number;
  scoreAfter: number;
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
  targetScore: number;
  currentScore: number;
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
  maxIterations: number;
  targetScore: number;
  timeoutMs: number;
}

export const DEFAULT_REPAIR_CONFIG: RepairConfig = {
  maxIterations: 5,
  targetScore: 80,
  timeoutMs: 120_000,
};
