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

export interface RepairPlanItem {
  issueId: string;
  severity: string;
  targetArtifact: string;
  repairStrategy: RepairStrategy;
  estimatedImpact: number;
  priority: number;
  decision: RepairDecision;
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
  tokenUsage: number;
  aiCost: number;
  repairsApplied: number;
  timestamp: number;
}

export interface RepairSessionState {
  projectId: string;
  status: "running" | "completed" | "stopped" | "timeout";
  currentIteration: number;
  maxIterations: number;
  targetScore: number;
  currentScore: number;
  history: RepairIterationRecord[];
  startedAt: number;
  finishedAt?: number;
  totalRepairs: number;
  stopReason?: string;
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
