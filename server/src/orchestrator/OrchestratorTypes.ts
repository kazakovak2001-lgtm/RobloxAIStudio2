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
  | "failed"
  | "paused"
  | "cancelled";

export type ExecutionStatus =
  "pending" | "running" | "completed" | "failed" | "skipped";

export interface ExecutionNode {
  id: string;
  phase: OrchestratorPhase;
  status: ExecutionStatus;
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

export interface CostTracker {
  totalTokens: number;
  totalCost: number;
  totalTimeMs: number;
  perPhase: Record<string, { tokens: number; cost: number; timeMs: number }>;
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
  status: "running" | "completed" | "paused" | "cancelled" | "failed";
  currentPhase: OrchestratorPhase;
  phases: ExecutionNode[];
  goals: GoalConfig;
  cost: CostTracker;
  checkpoints: Checkpoint[];
  qualityScore: number;
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
