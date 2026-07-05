import type { PipelineEvent } from "../execution/pipelineTypes";
import type { PipelineEventEmitter } from "../socket/streaming";
import type { ProjectMemory } from "../memory/ProjectMemory";
import type { PlanningMetrics } from "../planning/PlanningTypes";
import {
  createGameBlueprint,
  mergeBlueprint,
  type GameBlueprint,
} from "./GenerationBlueprint";
import { BlueprintValidator } from "./BlueprintValidator";
import { buildGenerationManifest } from "./GenerationManifest";
import { buildGenerationReport } from "./GenerationReport";
import {
  GenerationRegistry,
  getDefaultGenerationRegistry,
} from "./GenerationRegistry";
import { CURRENT_VERSIONS } from "./GenerationTypes";

/**
 * GenerationPipeline
 *
 * Consumes the existing AI infrastructure outputs and produces a complete,
 * validated GameBlueprint with manifest and report.
 *
 * This class is invoked AFTER AIPipelineIntegrator completes its plan-driven
 * execution. It reads from ProjectMemory and constructs the final blueprint.
 *
 * Responsibilities:
 *  - Create GameBlueprint from memory context
 *  - Deterministic merge of all agent outputs
 *  - Validate blueprint completeness and cross-agent consistency
 *  - Generate manifest and report
 *  - Emit generation events via SSE/Socket.io
 *  - Store results in GenerationRegistry
 */
export class GenerationPipeline {
  private validator = new BlueprintValidator();
  private registry: GenerationRegistry;

  constructor(
    private readonly events: PipelineEventEmitter,
    registry?: GenerationRegistry,
  ) {
    this.registry = registry ?? getDefaultGenerationRegistry();
  }

  /**
   * Finalize a generation from the completed ProjectMemory.
   * Called by GameGenerationService after AIPipelineIntegrator succeeds.
   */
  async finalize(
    memory: ProjectMemory,
    options: {
      provider: string;
      model: string;
      startedAt: Date;
      planningMetrics?: PlanningMetrics;
    },
  ): Promise<GameBlueprint> {
    const ctx = memory.readContext();
    const generationId = ctx.pipeline.executionId;

    await this.emitEvent("generation.started", generationId, {
      executionId: generationId,
      versions: CURRENT_VERSIONS,
    });

    // ── Create blueprint from memory context ────────────────────────────────
    let blueprint = createGameBlueprint(generationId, ctx.project);
    blueprint.status = "generating";

    // ── Merge all sections from memory ──────────────────────────────────────
    blueprint = mergeBlueprint(blueprint, {
      requirements: ctx.requirements,
      gameplay: ctx.gameplay,
      architecture: ctx.architecture,
      scripts: ctx.scripts,
      ui: ctx.ui,
      world: ctx.world,
      assets: ctx.assets,
      evaluation: ctx.evaluation,
      pipeline: ctx.pipeline,
      planning: {
        metrics: options.planningMetrics,
        replanCount: options.planningMetrics?.replanCount ?? 0,
      },
      memory: {
        snapshotCount: memory.getSnapshots().length,
        decisionCount: memory.getDecisions().length,
        warnings: [...ctx.warnings],
        recommendations: [...ctx.recommendations],
      },
      decisions: [...memory.getDecisions()],
    });

    await this.emitEvent("generation.blueprint.updated", generationId, {
      sectionsPopulated: Object.keys(blueprint).filter(
        (k) =>
          (blueprint as any)[k] !== undefined &&
          k !== "id" &&
          k !== "schemaVersion",
      ).length,
    });

    console.log(`[GENERATION] Blueprint Updated | Sections merged from memory`);

    // ── Validate blueprint ──────────────────────────────────────────────────
    const validation = this.validator.validate(blueprint);
    blueprint = mergeBlueprint(blueprint, { validation });

    await this.emitEvent("generation.validation.completed", generationId, {
      score: validation.score,
      status: validation.status,
      warnings: validation.warnings.length,
      errors: validation.errors.length,
    });

    // ── Build manifest ──────────────────────────────────────────────────────
    const agentsExecuted = ctx.pipeline.completedSteps;
    const manifest = buildGenerationManifest(blueprint, {
      provider: options.provider,
      model: options.model,
      startedAt: options.startedAt,
      agentsExecuted,
    });
    blueprint = mergeBlueprint(blueprint, { manifest });

    // ── Finalize status ─────────────────────────────────────────────────────
    blueprint.status = validation.status === "failed" ? "failed" : "complete";

    // ── Build report ────────────────────────────────────────────────────────
    const report = buildGenerationReport(blueprint, options.planningMetrics);

    await this.emitEvent("generation.report.created", generationId, {
      summary: report.summary,
      sectionsCount: report.sections.length,
    });

    // ── Store in registry ───────────────────────────────────────────────────
    this.registry.storeBlueprint(blueprint);
    this.registry.storeManifest(manifest);
    this.registry.storeReport(report);

    // ── Final event ─────────────────────────────────────────────────────────
    const eventType =
      blueprint.status === "complete"
        ? "generation.completed"
        : "generation.failed";

    await this.emitEvent(eventType, generationId, {
      status: blueprint.status,
      validationScore: validation.score,
      durationMs: manifest.durationMs,
      agentsExecuted: agentsExecuted.length,
      decisionsRecorded: blueprint.decisions?.length ?? 0,
    });

    return blueprint;
  }

  /**
   * Retrieve a previously generated blueprint.
   */
  getBlueprint(generationId: string): GameBlueprint | null {
    return this.registry.getBlueprint(generationId);
  }

  private async emitEvent(
    type: string,
    pipelineId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.events.emit({
      type: type as PipelineEvent["type"],
      pipelineId,
      data,
      timestamp: new Date(),
    });
  }
}
