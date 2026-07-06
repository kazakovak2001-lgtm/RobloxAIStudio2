/**
 * GenerationContext.ts
 *
 * Mutable context that persists during the entire pipeline execution.
 * Holds all intermediate outputs, stage records, and timing data.
 */

import type {
  GenerationContext as IGenerationContext,
  StageRecord,
  GeneratedArtifact,
} from "./types";
import { createSessionId } from "./types";

export class GenerationContextBuilder {
  /**
   * Create a new generation context for a session.
   */
  static create(params: {
    jobId: string;
    projectId: string;
    intent: string;
    constraints: string[];
    metadata?: Record<string, unknown>;
  }): IGenerationContext {
    return {
      sessionId: createSessionId(),
      jobId: params.jobId,
      projectId: params.projectId,
      intent: params.intent,
      constraints: params.constraints,
      stages: [],
      outputs: {},
      artifacts: [],
      timings: {},
      startedAt: Date.now(),
      metadata: params.metadata ?? {},
    };
  }

  /**
   * Begin a stage within the context.
   */
  static beginStage(ctx: IGenerationContext, stageName: string): void {
    const stage: StageRecord = {
      name: stageName,
      status: "running",
      startedAt: Date.now(),
    };
    ctx.stages.push(stage);
  }

  /**
   * Complete a stage within the context.
   */
  static completeStage(
    ctx: IGenerationContext,
    stageName: string,
    output?: unknown,
  ): void {
    const stage = ctx.stages.find(
      (s) => s.name === stageName && s.status === "running",
    );
    if (stage) {
      stage.status = "completed";
      stage.completedAt = Date.now();
      stage.durationMs = stage.completedAt - (stage.startedAt ?? ctx.startedAt);
      stage.output = output;
      ctx.timings[stageName] = stage.durationMs;
    }
    if (output && typeof output === "object") {
      ctx.outputs[stageName] = output;
    }
  }

  /**
   * Fail a stage within the context.
   */
  static failStage(
    ctx: IGenerationContext,
    stageName: string,
    error: string,
  ): void {
    const stage = ctx.stages.find(
      (s) => s.name === stageName && s.status === "running",
    );
    if (stage) {
      stage.status = "failed";
      stage.completedAt = Date.now();
      stage.durationMs = stage.completedAt - (stage.startedAt ?? ctx.startedAt);
      stage.error = error;
      ctx.timings[stageName] = stage.durationMs;
    }
  }

  /**
   * Add an artifact to the context.
   */
  static addArtifact(
    ctx: IGenerationContext,
    artifact: GeneratedArtifact,
  ): void {
    ctx.artifacts.push(artifact);
  }

  /**
   * Get completed stages.
   */
  static getCompletedStages(ctx: IGenerationContext): string[] {
    return ctx.stages
      .filter((s) => s.status === "completed")
      .map((s) => s.name);
  }

  /**
   * Check if a stage has completed.
   */
  static hasCompleted(ctx: IGenerationContext, stageName: string): boolean {
    return ctx.stages.some(
      (s) => s.name === stageName && s.status === "completed",
    );
  }
}
