/**
 * LuaGenerationEngine — Top-level facade for Roblox Lua code generation.
 */

import type {
  LuaGenerationRequest,
  LuaGenerationResult,
} from "./LuaGenerationTypes";
import { LuaArtifactBuilder } from "./LuaArtifactBuilder";
import { LuaCodeValidator } from "./LuaCodeValidator";

export class LuaGenerationEngine {
  private builder: LuaArtifactBuilder;
  private validator: LuaCodeValidator;

  constructor() {
    this.builder = new LuaArtifactBuilder();
    this.validator = new LuaCodeValidator();
  }

  /**
   * Generate a complete Lua script package for a project.
   */
  generate(request: LuaGenerationRequest): LuaGenerationResult {
    const startTime = Date.now();

    const { artifacts, manifest } =
      request.systems.length > 0
        ? this.builder.build(request)
        : this.builder.buildFullPackage(request);

    // Validate all artifacts
    let allPassed = true;
    for (const artifact of artifacts) {
      const report = this.validator.validate(artifact.name, artifact.content);
      artifact.validationScore = report.score;
      if (!report.passed) allPassed = false;
    }

    return {
      projectId: request.projectId,
      artifacts,
      manifest,
      totalScripts: artifacts.length,
      totalSizeBytes: artifacts.reduce((sum, a) => sum + a.sizeBytes, 0),
      generationTimeMs: Date.now() - startTime,
      validationPassed: allPassed,
    };
  }

  /**
   * Generate a full default package (all core systems).
   */
  generateFullPackage(
    projectId: string,
    gameName: string,
    genre: string,
  ): LuaGenerationResult {
    return this.generate({
      projectId,
      gameName,
      genre,
      systems: [],
    });
  }
}
