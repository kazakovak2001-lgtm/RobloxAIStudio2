/**
 * GenerationPackageBuilder.ts
 *
 * Builds a complete, deterministic generation package from context and artifacts.
 * The package contains everything needed to reproduce or inspect a generation.
 */

import { randomUUID } from "crypto";
import type {
  GenerationContext,
  GenerationPackage,
  GenerationManifest,
  GeneratedArtifact,
  PackageValidationReport,
} from "./types";
import { PipelineIntegrityValidator } from "./PipelineIntegrityValidator";

export class GenerationPackageBuilder {
  private integrityValidator: PipelineIntegrityValidator;

  constructor() {
    this.integrityValidator = new PipelineIntegrityValidator();
  }

  /**
   * Build a complete generation package.
   */
  build(
    ctx: GenerationContext,
    artifacts: GeneratedArtifact[],
  ): GenerationPackage {
    const scripts = artifacts.filter((a) => a.type === "lua-script");
    const configs = artifacts.filter((a) => a.type === "config");
    const validationReport = this.integrityValidator.validate(ctx, artifacts);
    const manifest = this.buildManifest(ctx, artifacts, validationReport);
    const totalSize = artifacts.reduce((sum, a) => sum + a.size, 0);

    return {
      packageId: `pkg-${randomUUID().slice(0, 12)}`,
      sessionId: ctx.sessionId,
      projectId: ctx.projectId,
      blueprint: ctx.outputs["planning"] ??
        ctx.outputs["blueprint"] ?? { intent: ctx.intent },
      executionPlan: ctx.outputs["execution"] ?? {
        stages: ctx.stages.map((s) => s.name),
      },
      scripts,
      configs,
      metadata: manifest,
      validationReport,
      totalArtifacts: artifacts.length,
      totalSizeBytes: totalSize,
      generatedAt: Date.now(),
    };
  }

  private buildManifest(
    ctx: GenerationContext,
    artifacts: GeneratedArtifact[],
    validation: PackageValidationReport,
  ): GenerationManifest {
    const agentVersions: Record<string, string> = {};
    const artifactVersions: Record<string, string> = {};
    const executionTimestamps: Record<string, number> = {};
    const validationResults: Record<string, boolean> = {};

    for (const stage of ctx.stages) {
      agentVersions[stage.name] = "1.0.0";
      if (stage.startedAt) executionTimestamps[stage.name] = stage.startedAt;
      validationResults[stage.name] = stage.status === "completed";
    }

    for (const art of artifacts) {
      artifactVersions[art.path] = "1.0.0";
    }

    validationResults["integrity"] = validation.valid;

    return {
      generationId: ctx.sessionId,
      blueprintVersion: "1.0.0",
      plannerVersion: "1.0.0",
      agentVersions,
      artifactVersions,
      executionTimestamps,
      validationResults,
    };
  }
}
