/**
 * Generation Pipeline Coordinator — shared types.
 */

import { randomUUID } from "crypto";

// ─── Generation Session ──────────────────────────────────────────────────────

export interface GenerationSession {
  sessionId: string;
  jobId: string;
  intent: string;
  constraints: string[];
  projectId: string;
  createdAt: number;
  completedAt?: number;
  status: "active" | "completed" | "failed";
}

// ─── Generation Context ──────────────────────────────────────────────────────

export interface GenerationContext {
  sessionId: string;
  jobId: string;
  projectId: string;
  intent: string;
  constraints: string[];
  planId?: string;
  stages: StageRecord[];
  outputs: Record<string, unknown>;
  artifacts: GeneratedArtifact[];
  timings: Record<string, number>;
  startedAt: number;
  metadata: Record<string, unknown>;
}

export interface StageRecord {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export interface GeneratedArtifact {
  id: string;
  type:
    | "lua-script"
    | "config"
    | "asset-manifest"
    | "blueprint"
    | "metadata"
    | "validation-report";
  path: string;
  content: unknown;
  size: number;
  generatedBy: string;
  timestamp: number;
}

// ─── Generation Package ──────────────────────────────────────────────────────

export interface GenerationPackage {
  packageId: string;
  sessionId: string;
  projectId: string;
  blueprint: unknown;
  executionPlan: unknown;
  scripts: GeneratedArtifact[];
  configs: GeneratedArtifact[];
  metadata: GenerationManifest;
  validationReport: PackageValidationReport;
  totalArtifacts: number;
  totalSizeBytes: number;
  generatedAt: number;
}

export interface GenerationManifest {
  generationId: string;
  blueprintVersion: string;
  plannerVersion: string;
  agentVersions: Record<string, string>;
  artifactVersions: Record<string, string>;
  executionTimestamps: Record<string, number>;
  validationResults: Record<string, boolean>;
}

export interface PackageValidationReport {
  valid: boolean;
  stagesExecuted: number;
  stagesExpected: number;
  artifactsGenerated: number;
  missingDependencies: string[];
  duplicatedOutputs: string[];
  unresolvedReferences: string[];
  structureValid: boolean;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface GenerationMetrics {
  planningDurationMs: number;
  executionDurationMs: number;
  artifactDurationMs: number;
  validationDurationMs: number;
  totalDurationMs: number;
  agentCallCount: number;
  artifactCount: number;
  packageSizeBytes: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createSessionId(): string {
  return `gen-${randomUUID().slice(0, 12)}`;
}

export function createArtifactId(): string {
  return `art-${randomUUID().slice(0, 8)}`;
}
