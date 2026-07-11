/**
 * LuaArtifactBuilder — Builds complete artifact packages from templates.
 */

import { randomUUID } from "crypto";
import type {
  LuaArtifact,
  ArtifactManifest,
  LuaGenerationRequest,
} from "./LuaGenerationTypes";
import {
  LuaTemplateRegistry,
  type TemplateContext,
} from "./LuaTemplateRegistry";
import { LuaCodeValidator } from "./LuaCodeValidator";

export class LuaArtifactBuilder {
  private registry: LuaTemplateRegistry;
  private validator: LuaCodeValidator;

  constructor() {
    this.registry = new LuaTemplateRegistry();
    this.validator = new LuaCodeValidator();
  }

  /**
   * Build all artifacts for the requested systems.
   */
  build(request: LuaGenerationRequest): {
    artifacts: LuaArtifact[];
    manifest: ArtifactManifest;
  } {
    const context: TemplateContext = {
      gameName: request.gameName,
      genre: request.genre,
      features: request.features ?? [],
    };

    const artifacts: LuaArtifact[] = [];

    for (const system of request.systems) {
      const templates = this.registry.get(system);
      for (const template of templates) {
        const startTime = Date.now();
        const content = template.generate(context);
        const generationTime = Date.now() - startTime;

        const report = this.validator.validate(template.name, content);

        const artifact: LuaArtifact = {
          id: `lua-${randomUUID().slice(0, 10)}`,
          name: template.name,
          scriptType: template.scriptType,
          path: template.path,
          content,
          dependencies: template.dependencies,
          generatedByAgent: "lua_generator",
          generationTime,
          validationScore: report.score,
          system,
          sizeBytes: Buffer.byteLength(content, "utf8"),
        };

        artifacts.push(artifact);
      }
    }

    const manifest = this.buildManifest(request.projectId, artifacts);
    return { artifacts, manifest };
  }

  /**
   * Build a complete default package with all core systems.
   */
  buildFullPackage(request: LuaGenerationRequest): {
    artifacts: LuaArtifact[];
    manifest: ArtifactManifest;
  } {
    const fullRequest: LuaGenerationRequest = {
      ...request,
      systems: [
        "config",
        "remotes",
        "datastore",
        "lobby",
        "gameplay",
        "inventory",
        "player",
        "ui",
      ],
    };
    return this.build(fullRequest);
  }

  private buildManifest(
    projectId: string,
    artifacts: LuaArtifact[],
  ): ArtifactManifest {
    return {
      projectId,
      generatedAt: Date.now(),
      version: "1.0.0",
      artifacts: artifacts.map((a) => ({
        artifactId: a.id,
        scriptType: a.scriptType,
        path: a.path,
        dependencies: a.dependencies,
        generatedByAgent: a.generatedByAgent,
        generationTime: a.generationTime,
        validationScore: a.validationScore,
      })),
      totalScripts: artifacts.length,
      totalSizeBytes: artifacts.reduce((sum, a) => sum + a.sizeBytes, 0),
    };
  }
}
