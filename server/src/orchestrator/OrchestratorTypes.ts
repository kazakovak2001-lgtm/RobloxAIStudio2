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
  | "preview_completed"
  | "simulated"
  | "failed"
  | "paused"
  | "cancelled";

export type ExecutionMode = "simulation" | "bounded" | "production";
export type ResultAuthority = "preview-only" | "production";
export type EvidenceLevel = "heuristic" | "synthetic" | "verified";
export type PhaseCapabilityStatus = "available" | "degraded" | "unavailable";

export type ExecutionStatus =
  "pending" | "running" | "completed" | "simulated" | "failed" | "skipped";

export interface ExecutionNode {
  id: string;
  phase: OrchestratorPhase;
  status: ExecutionStatus;
  executionMode?: ExecutionMode;
  evidence?: EvidenceLevel;
  capability?: PhaseCapabilityStatus;
  service?: string;
  cancellable?: boolean;
  checkpointable?: boolean;
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
  id: string;
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
    | "running"
    | "completed"
    | "preview_completed"
    | "simulated"
    | "paused"
    | "cancelled"
    | "failed";
  currentPhase: OrchestratorPhase;
  phases: ExecutionNode[];
  goals: GoalConfig;
  cost: CostTracker;
  checkpoints: Checkpoint[];
  qualityScore: number | null;
  /**
   * The heuristic total a pre-PLAYTEST-TRUTH-1 session persisted, kept only as
   * a record of what an older build wrote.
   *
   * A durable session written before this slice carries a number in
   * `qualityScore`, and its playtest phase is not rerun on recovery. Restoring
   * that number would republish the old heuristic as current quality — an
   * average that added five points when the generated source contained the
   * substring `pcall`. The value is moved here on read instead of being
   * dropped, so the row stays auditable, and `qualityScore` becomes `null`
   * because nothing measured anything. **Never a measurement, never compared,
   * never promoted back.**
   */
  legacyQualityScore?: number;
  startedAt: number;
  finishedAt?: number;
  genre?: string;
  estimatedTimeMs?: number;
  estimatedCost?: number;
  recoveryCount: number;
  executionGeneration: number;
  restartInterruptedAt?: number;
  recoveryReason?: "server_restart";
  terminalEvidenceId?: string;
}

/**
 * Demote a legacy heuristic quality score to historical evidence.
 *
 * PLAYTEST-TRUTH-1. Nothing measures runtime quality, so a live session's
 * `qualityScore` is `null`. A session or checkpoint persisted before this slice
 * holds a number there, and neither loading nor recovering reruns the playtest
 * phase that produced it. Without this, that number is republished by the
 * session API and the terminal preview event as though it were current
 * measured quality.
 *
 * The number is preserved in `legacyQualityScore` rather than discarded: the
 * row remains auditable, and its meaning is downgraded rather than reinterpreted.
 * Idempotent, and a no-op for sessions that already report `null`.
 */
export function demoteLegacyQualityScore(session: OrchestratorSession): void {
  if (typeof session.qualityScore !== "number") return;
  if (session.legacyQualityScore === undefined) {
    session.legacyQualityScore = session.qualityScore;
  }
  session.qualityScore = null;
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
