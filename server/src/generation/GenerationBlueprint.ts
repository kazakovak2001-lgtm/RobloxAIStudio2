/**
 * GenerationBlueprint.ts
 *
 * The central typed data model for the entire generation process.
 * Every agent writes into this blueprint; it accumulates all outputs
 * into a single coherent structure.
 */

import type {
  ProjectInfo,
  GameRequirements,
  GameplayContext,
  ArchitectureContext,
  ScriptsContext,
  UIContext,
  WorldContext,
  AssetsContext,
  EvaluationSummaryContext,
  PipelineMetaContext,
  ArchitecturalDecision,
} from "../memory/MemoryTypes";
import type { PlanningMetrics } from "../planning/PlanningTypes";
import type {
  GenerationManifest,
  BlueprintValidationResult,
} from "./GenerationTypes";

/**
 * GameBlueprint — the canonical output of the generation pipeline.
 * Every section is optional and extensible.
 */
export interface GameBlueprint {
  /** Unique generation ID */
  id: string;
  /** Schema version for forward compatibility */
  schemaVersion: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;

  // ─── Core sections (populated by agents) ─────────────────────────────────
  project?: ProjectInfo;
  requirements?: GameRequirements;
  gameplay?: GameplayContext;
  architecture?: ArchitectureContext;
  scripts?: ScriptsContext;
  ui?: UIContext;
  world?: WorldContext;
  assets?: AssetsContext; // placeholder

  // ─── Metadata sections ────────────────────────────────────────────────────
  pipeline?: PipelineMetaContext;
  evaluation?: EvaluationSummaryContext;
  planning?: {
    metrics?: PlanningMetrics;
    replanCount?: number;
  };
  memory?: {
    snapshotCount?: number;
    decisionCount?: number;
    warnings?: string[];
    recommendations?: string[];
  };

  /** Architectural decisions recorded during generation */
  decisions?: ArchitecturalDecision[];

  /** Validation result (populated after blueprint finalization) */
  validation?: BlueprintValidationResult;

  /** Generation manifest (populated at pipeline completion) */
  manifest?: GenerationManifest;

  /** Generation status */
  status: "draft" | "generating" | "validated" | "complete" | "failed";
}

/**
 * Create an empty GameBlueprint shell for a new generation.
 */
export function createGameBlueprint(
  generationId: string,
  project?: ProjectInfo,
): GameBlueprint {
  return {
    id: generationId,
    schemaVersion: "1.0.0",
    createdAt: new Date(),
    updatedAt: new Date(),
    project,
    status: "draft",
  };
}

/**
 * Merge a partial update into the blueprint.
 * Arrays in source overwrite target (no concatenation).
 * Objects are deep-merged.
 */
export function mergeBlueprint(
  blueprint: GameBlueprint,
  update: Partial<Omit<GameBlueprint, "id" | "schemaVersion" | "createdAt">>,
): GameBlueprint {
  const merged: GameBlueprint = { ...blueprint };
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) continue;
    const existing = (merged as any)[key];
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      (merged as any)[key] = { ...existing, ...value };
    } else {
      (merged as any)[key] = value;
    }
  }
  merged.updatedAt = new Date();
  return merged;
}
