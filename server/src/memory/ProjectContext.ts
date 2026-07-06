/**
 * ProjectContext.ts
 *
 * Factory and helpers for the ProjectContext object.
 * The ProjectContext is the canonical shared state passed to every agent.
 */

import type {
  ProjectContext,
  PipelineMetaContext,
  ProjectInfo,
  GameRequirements,
  GameplayContext,
  ArchitectureContext,
  ScriptsContext,
  UIContext,
  WorldContext,
  AssetsContext,
  EvaluationSummaryContext,
} from "./MemoryTypes";
import { MemorySerializer } from "./MemorySerializer";

/**
 * Create a fresh ProjectContext for a new execution.
 */
export function createProjectContext(
  executionId: string,
  blueprintId?: string,
  projectInfo?: ProjectInfo,
): ProjectContext {
  const pipeline: PipelineMetaContext = {
    executionId,
    blueprintId,
    startedAt: new Date(),
    completedSteps: [],
  };

  return {
    pipeline,
    project: projectInfo,
    warnings: [],
    recommendations: [],
  };
}

/**
 * Merge a partial context update into an existing context.
 * Preserves all existing data; only overwrites provided sections.
 */
export function mergeContextUpdate(
  ctx: ProjectContext,
  update: Partial<
    Omit<ProjectContext, "pipeline" | "warnings" | "recommendations">
  > & {
    requirements?: GameRequirements;
    gameplay?: GameplayContext;
    architecture?: ArchitectureContext;
    scripts?: ScriptsContext;
    ui?: UIContext;
    world?: WorldContext;
    assets?: AssetsContext;
    evaluation?: EvaluationSummaryContext;
  },
): ProjectContext {
  return MemorySerializer.deepMerge(
    ctx as unknown as Record<string, unknown>,
    update as unknown as Partial<Record<string, unknown>>,
  ) as unknown as ProjectContext;
}

// Re-export section types for convenience
export type {
  ProjectContext,
  PipelineMetaContext,
  ProjectInfo,
  GameRequirements,
  GameplayContext,
  ArchitectureContext,
  ScriptsContext,
  UIContext,
  WorldContext,
  AssetsContext,
  EvaluationSummaryContext,
};
