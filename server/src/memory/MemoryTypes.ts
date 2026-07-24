/**
 * MemoryTypes.ts
 *
 * All shared type definitions for the Project Memory Layer (v0.7).
 * No runtime logic — pure type contracts.
 */

// ─── Decision History ─────────────────────────────────────────────────────────

export type DecisionStatus =
  "proposed" | "accepted" | "rejected" | "superseded";
export type DecisionCategory =
  | "gameplay"
  | "architecture"
  | "ui"
  | "assets"
  | "scripts"
  | "world"
  | "requirements"
  | "planning"
  | "evaluation"
  | "other";

export interface ArchitecturalDecision {
  id: string;
  agent: string;
  timestamp: Date;
  category: DecisionCategory;
  summary: string;
  details: string;
  reason: string;
  impact: string;
  status: DecisionStatus;
}

// ─── Execution History ────────────────────────────────────────────────────────

export interface AgentExecutionRecord {
  agent: string;
  stepId: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  qualityScore?: number;
  evaluationStatus?: "passed" | "warning" | "failed";
  warnings: string[];
  errors: string[];
}

// ─── Project Context sections ─────────────────────────────────────────────────

export interface ProjectInfo {
  name?: string;
  description?: string;
  gameType?: string;
  genre?: string[];
  targetAudience?: string;
  difficulty?: string;
  estimatedPlayers?: string;
}

export interface GameRequirements {
  functional?: string[];
  non_functional?: Record<string, string>;
  constraints?: string[];
  success_criteria?: string[];
}

export interface GameplayContext {
  coreLoop?: string;
  mechanics?: Array<{ name: string; description: string }>;
  winCondition?: string;
  loseCondition?: string;
  progressionModel?: string;
  interactionSystems?: string[];
  economyOrScoring?: string;
  theme?: string;
}

export interface ArchitectureContext {
  folderStructure?: Record<string, unknown>;
  dataModels?: Record<string, unknown>;
  services?: Record<string, string>;
  apiContracts?: Record<string, unknown>;
  clientArchitecture?: Record<string, unknown>;
  serverArchitecture?: Record<string, unknown>;
  networking?: Record<string, unknown>;
}

export interface ScriptsContext {
  server?: Array<{ name: string; code: string }>;
  client?: Array<{ name: string; code: string }>;
  shared?: Array<{ name: string; code: string }>;
  patterns?: string[];
}

export interface UIContext {
  screens?: Array<{ name: string; type: string; elements: unknown[] }>;
  components?: Record<string, unknown>;
}

export interface WorldContext {
  name?: string;
  description?: string;
  places?: unknown[];
  models?: unknown[];
  systemsHooks?: Record<string, unknown>;
}

/** Assets section is a placeholder per task spec — kept minimal. */
export interface AssetsContext {
  models?: unknown[];
  textures?: unknown[];
  sounds?: unknown[];
  animations?: unknown[];
}

export interface EvaluationSummaryContext {
  lastScore?: number;
  lastStatus?: "passed" | "warning" | "failed";
  totalIssues?: number;
  recommendations?: string[];
}

export interface PipelineMetaContext {
  executionId: string;
  blueprintId?: string;
  startedAt: Date;
  completedSteps: string[];
  failedStep?: string;
  totalDurationMs?: number;
}

// ─── ProjectContext — master state object ─────────────────────────────────────

export interface ProjectContext {
  project?: ProjectInfo;
  requirements?: GameRequirements;
  gameplay?: GameplayContext;
  architecture?: ArchitectureContext;
  scripts?: ScriptsContext;
  ui?: UIContext;
  world?: WorldContext;
  assets?: AssetsContext; // placeholder only
  evaluation?: EvaluationSummaryContext;
  pipeline: PipelineMetaContext;
  /** Free-form agent notes — warnings and recommendations accumulated across steps. */
  warnings: string[];
  recommendations: string[];
}

// ─── Memory Snapshot ──────────────────────────────────────────────────────────

export interface MemorySnapshot {
  id: string;
  snapshotNumber: number;
  pipelineStep: string;
  context: ProjectContext;
  decisions: ArchitecturalDecision[];
  evaluationSummary?: EvaluationSummaryContext;
  timestamp: Date;
}
