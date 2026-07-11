/**
 * ExperienceAssembler — Assembles a complete Roblox Experience from artifacts.
 */

import type {
  ExperienceManifestData,
  ExperienceValidationReport,
} from "./ExperienceTypes";
import type { LuaArtifact, LuaGenerationResult } from "../lua";
import { FolderStructureBuilder } from "./FolderStructureBuilder";
import { DependencyResolver } from "./DependencyResolver";
import { ExperienceValidator } from "./ExperienceValidator";

export interface AssemblyResult {
  manifest: ExperienceManifestData;
  validation: ExperienceValidationReport;
  success: boolean;
}

export class ExperienceAssembler {
  private folderBuilder: FolderStructureBuilder;
  private dependencyResolver: DependencyResolver;
  private validator: ExperienceValidator;

  constructor() {
    this.folderBuilder = new FolderStructureBuilder();
    this.dependencyResolver = new DependencyResolver();
    this.validator = new ExperienceValidator();
  }

  /**
   * Assemble a complete experience from Lua generation output.
   */
  assemble(
    generationResult: LuaGenerationResult,
    conceptId?: string,
    pipelineId?: string,
  ): AssemblyResult {
    const artifacts = generationResult.artifacts;

    // Build hierarchy
    const hierarchy = this.folderBuilder.build(artifacts);

    // Resolve dependencies
    const dependencyGraph = this.dependencyResolver.resolve(artifacts);

    // Validate
    const validation = this.validator.validate(
      artifacts,
      hierarchy,
      dependencyGraph,
    );

    // Build manifest
    const manifest: ExperienceManifestData = {
      projectId: generationResult.projectId,
      conceptId,
      pipelineId,
      generatedAt: Date.now(),
      version: "1.0.0",
      artifacts: artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        scriptType: a.scriptType,
        service: this.getService(a, hierarchy),
        path: a.path,
        dependencies: a.dependencies,
        validationScore: a.validationScore,
      })),
      dependencyGraph,
      hierarchy,
      validationScore: validation.score,
      totalScripts: artifacts.length,
      totalSizeBytes: generationResult.totalSizeBytes,
    };

    return {
      manifest,
      validation,
      success: validation.valid,
    };
  }

  private getService(
    artifact: LuaArtifact,
    hierarchy: import("./ExperienceTypes").ExperienceNode[],
  ): import("./ExperienceTypes").RobloxService {
    for (const svc of hierarchy) {
      if (svc.children?.some((c) => c.artifactId === artifact.id)) {
        return svc.service;
      }
    }
    return "ReplicatedStorage";
  }
}
