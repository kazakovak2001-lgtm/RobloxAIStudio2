import type { GenerationManifest } from "./GenerationTypes";
import { CURRENT_VERSIONS } from "./GenerationTypes";
import type { GameBlueprint } from "./GenerationBlueprint";

/**
 * Build a GenerationManifest from a completed GameBlueprint.
 */
export function buildGenerationManifest(
  blueprint: GameBlueprint,
  options: {
    provider: string;
    model: string;
    startedAt: Date;
    agentsExecuted: string[];
  },
): GenerationManifest {
  const now = new Date();
  const durationMs = now.getTime() - options.startedAt.getTime();

  return {
    generationId: blueprint.id,
    pipelineVersion: CURRENT_VERSIONS.generationPipeline,
    planningVersion: CURRENT_VERSIONS.planningEngine,
    memoryVersion: CURRENT_VERSIONS.memoryLayer,
    evaluationVersion: CURRENT_VERSIONS.evaluationLayer,
    blueprintSchemaVersion: CURRENT_VERSIONS.blueprintSchema,
    provider: options.provider,
    model: options.model,
    startedAt: options.startedAt,
    completedAt: now,
    durationMs,
    agentsExecuted: options.agentsExecuted,
    qualityScore:
      blueprint.evaluation?.lastScore ?? blueprint.validation?.score ?? 0,
    status: blueprint.status === "complete" ? "completed" : "failed",
    warnings: blueprint.memory?.warnings ?? [],
    recommendations: blueprint.memory?.recommendations ?? [],
    replanCount: blueprint.planning?.replanCount ?? 0,
    snapshotCount: blueprint.memory?.snapshotCount ?? 0,
    decisionCount: blueprint.decisions?.length ?? 0,
  };
}
