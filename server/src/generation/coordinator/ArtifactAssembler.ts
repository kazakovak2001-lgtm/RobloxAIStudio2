/**
 * ArtifactAssembler.ts
 *
 * Collects all generated outputs and assembles them into a verified artifact set.
 * Ensures:
 *   - No duplicate artifacts
 *   - No orphan outputs
 *   - All references resolved
 *   - Completeness verified
 */

import type { GenerationContext, GeneratedArtifact } from "./types";
import { createArtifactId } from "./types";

export interface AssemblyResult {
  artifacts: GeneratedArtifact[];
  totalSize: number;
  duplicatesRemoved: number;
  orphansDetected: number;
  valid: boolean;
  errors: string[];
}

export class ArtifactAssembler {
  /**
   * Assemble artifacts from generation context outputs.
   */
  assemble(ctx: GenerationContext): AssemblyResult {
    const artifacts: GeneratedArtifact[] = [];
    const seen = new Set<string>();
    let duplicatesRemoved = 0;
    const errors: string[] = [];

    // Collect artifacts already in context
    for (const art of ctx.artifacts) {
      if (seen.has(art.path)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(art.path);
      artifacts.push(art);
    }

    // Extract artifacts from stage outputs
    for (const [stageName, output] of Object.entries(ctx.outputs)) {
      if (!output || typeof output !== "object") continue;

      const extracted = this.extractFromOutput(
        stageName,
        output as Record<string, unknown>,
      );
      for (const art of extracted) {
        if (seen.has(art.path)) {
          duplicatesRemoved++;
          continue;
        }
        seen.add(art.path);
        artifacts.push(art);
      }
    }

    // Detect orphan outputs (outputs that didn't produce any artifact)
    let orphansDetected = 0;
    for (const stage of ctx.stages) {
      if (stage.status === "completed" && stage.output) {
        const hasArtifact = artifacts.some((a) => a.generatedBy === stage.name);
        if (!hasArtifact) orphansDetected++;
      }
    }

    // Verify completeness
    if (
      artifacts.length === 0 &&
      ctx.stages.some((s) => s.status === "completed")
    ) {
      errors.push("No artifacts produced despite completed stages");
    }

    const totalSize = artifacts.reduce((sum, a) => sum + a.size, 0);

    return {
      artifacts,
      totalSize,
      duplicatesRemoved,
      orphansDetected,
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Verify all cross-references between artifacts are resolved.
   */
  verifyReferences(artifacts: GeneratedArtifact[]): {
    valid: boolean;
    unresolved: string[];
  } {
    const allPaths = new Set(artifacts.map((a) => a.path));
    const unresolved: string[] = [];

    for (const art of artifacts) {
      if (typeof art.content === "object" && art.content !== null) {
        const refs = this.findReferences(
          art.content as Record<string, unknown>,
        );
        for (const ref of refs) {
          if (!allPaths.has(ref) && !ref.startsWith("http")) {
            unresolved.push(`${art.path} → ${ref}`);
          }
        }
      }
    }

    return { valid: unresolved.length === 0, unresolved };
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private extractFromOutput(
    stageName: string,
    output: Record<string, unknown>,
  ): GeneratedArtifact[] {
    const artifacts: GeneratedArtifact[] = [];

    // Extract lua scripts
    if (output.scripts || output.lua_generator) {
      const scripts = (output.scripts ?? output.lua_generator) as Record<
        string,
        unknown
      >;
      for (const [category, items] of Object.entries(scripts)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            const content =
              typeof item === "string" ? item : JSON.stringify(item);
            artifacts.push({
              id: createArtifactId(),
              type: "lua-script",
              path: `scripts/${category}/${stageName}_${artifacts.length}.lua`,
              content,
              size: content.length * 2,
              generatedBy: stageName,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    // Extract configs
    if (output.config || output.configuration) {
      const config = output.config ?? output.configuration;
      const content = JSON.stringify(config);
      artifacts.push({
        id: createArtifactId(),
        type: "config",
        path: `config/${stageName}.json`,
        content: config,
        size: content.length * 2,
        generatedBy: stageName,
        timestamp: Date.now(),
      });
    }

    // If no specific extraction matched, store as metadata
    if (artifacts.length === 0 && Object.keys(output).length > 0) {
      const content = JSON.stringify(output);
      artifacts.push({
        id: createArtifactId(),
        type: "metadata",
        path: `metadata/${stageName}.json`,
        content: output,
        size: content.length * 2,
        generatedBy: stageName,
        timestamp: Date.now(),
      });
    }

    return artifacts;
  }

  private findReferences(
    obj: Record<string, unknown>,
    refs: string[] = [],
  ): string[] {
    for (const value of Object.values(obj)) {
      if (
        typeof value === "string" &&
        (value.endsWith(".lua") ||
          value.endsWith(".json") ||
          value.startsWith("scripts/"))
      ) {
        refs.push(value);
      } else if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        this.findReferences(value as Record<string, unknown>, refs);
      }
    }
    return refs;
  }
}
