/**
 * ExperienceValidator — Validates a complete assembled Roblox Experience.
 */

import type {
  ExperienceNode,
  DependencyGraph,
  ExperienceValidationReport,
} from "./ExperienceTypes";
import type { LuaArtifact } from "../lua";

export class ExperienceValidator {
  /**
   * Validate the assembled experience.
   */
  validate(
    artifacts: LuaArtifact[],
    hierarchy: ExperienceNode[],
    dependencyGraph: DependencyGraph,
  ): ExperienceValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingScripts: string[] = [];
    const duplicateNames: string[] = [];
    const invalidPlacements: string[] = [];
    const unresolvedDependencies: string[] = [];

    this.checkDuplicateNames(artifacts, duplicateNames);
    this.checkPlacements(hierarchy, invalidPlacements);
    this.checkUnresolvedDeps(artifacts, unresolvedDependencies);
    this.checkMissingCoreScripts(artifacts, missingScripts, warnings);

    if (duplicateNames.length > 0)
      errors.push(`${duplicateNames.length} duplicate script names`);
    if (invalidPlacements.length > 0)
      errors.push(`${invalidPlacements.length} invalid placements`);
    if (unresolvedDependencies.length > 0)
      warnings.push(`${unresolvedDependencies.length} unresolved dependencies`);
    if (dependencyGraph.circular.length > 0)
      errors.push(`${dependencyGraph.circular.length} circular reference(s)`);

    const score = this.calculateScore(errors, warnings, artifacts);

    return {
      valid: errors.length === 0,
      score,
      errors,
      warnings,
      missingScripts,
      duplicateNames,
      invalidPlacements,
      unresolvedDependencies,
      circularReferences: dependencyGraph.circular,
    };
  }

  private checkDuplicateNames(
    artifacts: LuaArtifact[],
    duplicates: string[],
  ): void {
    const names = new Map<string, number>();
    for (const a of artifacts) {
      names.set(a.name, (names.get(a.name) ?? 0) + 1);
    }
    for (const [name, count] of names) {
      if (count > 1) duplicates.push(name);
    }
  }

  private checkPlacements(
    hierarchy: ExperienceNode[],
    invalid: string[],
  ): void {
    for (const service of hierarchy) {
      for (const child of service.children ?? []) {
        // ServerScripts should not be in ReplicatedStorage
        if (
          child.type === "Script" &&
          service.service === "ReplicatedStorage"
        ) {
          invalid.push(`${child.name}: ServerScript in ReplicatedStorage`);
        }
        // LocalScripts should not be in ServerScriptService
        if (
          child.type === "LocalScript" &&
          service.service === "ServerScriptService"
        ) {
          invalid.push(`${child.name}: LocalScript in ServerScriptService`);
        }
      }
    }
  }

  private checkUnresolvedDeps(
    artifacts: LuaArtifact[],
    unresolved: string[],
  ): void {
    const names = new Set(artifacts.map((a) => a.name));
    for (const artifact of artifacts) {
      for (const dep of artifact.dependencies) {
        if (!names.has(dep)) {
          unresolved.push(`${artifact.name} → ${dep}`);
        }
      }
    }
  }

  private checkMissingCoreScripts(
    artifacts: LuaArtifact[],
    missing: string[],
    warnings: string[],
  ): void {
    const names = new Set(artifacts.map((a) => a.name));
    const recommended = ["SharedConfig", "RemoteEvents"];
    for (const name of recommended) {
      if (!names.has(name)) {
        missing.push(name);
        warnings.push(`Recommended script missing: ${name}`);
      }
    }
  }

  private calculateScore(
    errors: string[],
    warnings: string[],
    artifacts: LuaArtifact[],
  ): number {
    let score = 100;
    score -= errors.length * 15;
    score -= warnings.length * 5;
    if (artifacts.length >= 5) score += 5;
    if (artifacts.length >= 8) score += 5;
    return Math.max(0, Math.min(100, score));
  }
}
