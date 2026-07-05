/**
 * GenerationTypes.ts — All type definitions for the Roblox Generation Pipeline (v0.9).
 */

// ─── Pipeline Versioning ──────────────────────────────────────────────────────

export interface PipelineVersions {
  generationPipeline: string;
  planningEngine: string;
  memoryLayer: string;
  evaluationLayer: string;
  blueprintSchema: string;
  manifestSchema: string;
}

export const CURRENT_VERSIONS: PipelineVersions = {
  generationPipeline: "0.9.0",
  planningEngine: "0.8.0",
  memoryLayer: "0.7.0",
  evaluationLayer: "0.6.0",
  blueprintSchema: "1.0.0",
  manifestSchema: "1.0.0",
};

// ─── Generation Status ────────────────────────────────────────────────────────

export type GenerationStatus =
  | "initializing"
  | "running"
  | "validating"
  | "completed"
  | "failed";

// ─── Blueprint Validation ─────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  code: string;
  section: string;
  message: string;
  severity: ValidationSeverity;
}

export interface BlueprintValidationResult {
  status: "passed" | "warnings" | "failed";
  score: number; // 0–100
  issues: ValidationIssue[];
  warnings: string[];
  errors: string[];
  sectionsPresent: string[];
  sectionsMissing: string[];
}

// ─── Generation Manifest ──────────────────────────────────────────────────────

export interface GenerationManifest {
  generationId: string;
  pipelineVersion: string;
  planningVersion: string;
  memoryVersion: string;
  evaluationVersion: string;
  blueprintSchemaVersion: string;
  provider: string;
  model: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  agentsExecuted: string[];
  qualityScore: number;
  status: GenerationStatus;
  warnings: string[];
  recommendations: string[];
  replanCount: number;
  snapshotCount: number;
  decisionCount: number;
}

// ─── Generation Report ────────────────────────────────────────────────────────

export interface GenerationReportSection {
  title: string;
  content: string | Record<string, unknown>;
}

export interface GenerationReport {
  generationId: string;
  createdAt: Date;
  summary: string;
  sections: GenerationReportSection[];
}
