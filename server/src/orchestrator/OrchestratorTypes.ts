/**
 * Autonomous Orchestrator Types.
 */

import { randomUUID } from "crypto";

export type OrchestratorPhase =
  | "genre_detection"
  | "knowledge_search"
  | "blueprint"
  | "agent_collaboration"
  | "lua_generation"
  | "asset_generation"
  | "experience_assembly"
  | "playtest"
  | "repair"
  | "benchmark"
  | "studio_sync"
  | "completed"
  | "simulated"
  | "failed"
  | "paused"
  | "cancelled";

export type ExecutionMode = "simulation" | "production";
export type ResultAuthority = "preview-only" | "production";
export type EvidenceLevel = "heuristic" | "synthetic" | "verified";

export type ExecutionStatus =
  "pending" | "running" | "completed" | "simulated" | "failed" | "skipped";

export interface ExecutionNode {
  id: string;
  phase: OrchestratorPhase;
  status: ExecutionStatus;
  executionMode?: ExecutionMode;
  evidence?: EvidenceLevel;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  output?: unknown;
  error?: string;
  skippedReason?: string;
}

export interface GoalConfig {
  targetScore: number;
  targetGenre?: string;
  budget: number;
  timeLimitMs: number;
  maxCost: number;
  maxRepairIterations: number;
}

export interface PhaseCost {
  tokens: number;
  cost: number;
  timeMs: number;
  source: "synthetic" | "measured";
}

export interface CostTracker {
  totalTokens: number;
  totalCost: number;
  totalTimeMs: number;
  source: "synthetic" | "measured";
  perPhase: Record<string, PhaseCost>;
}

export interface Checkpoint {
  phase: OrchestratorPhase;
  timestamp: number;
  snapshot: Record<string, unknown>;
}

export interface OrchestratorSession {
  id: string;
  projectId: string;
  prompt: string;
  executionMode: ExecutionMode;
  resultAuthority: ResultAuthority;
  status:
    "running" | "completed" | "simulated" | "paused" | "cancelled" | "failed";
  currentPhase: OrchestratorPhase;
  phases: ExecutionNode[];
  goals: GoalConfig;
  cost: CostTracker;
  checkpoints: Checkpoint[];
  qualityScore: number | null;
  startedAt: number;
  finishedAt?: number;
  genre?: string;
  estimatedTimeMs?: number;
  estimatedCost?: number;
}

export const DEFAULT_GOALS: GoalConfig = {
  targetScore: 80,
  budget: 10000,
  timeLimitMs: 300_000,
  maxCost: 1.0,
  maxRepairIterations: 3,
};

export function createSessionId(): string {
  return `orch-${randomUUID().slice(0, 10)}`;
}
