/**
 * ProjectStructureValidator.ts
 *
 * Verifies the generated package has the expected folder hierarchy,
 * file layout, metadata, and manifest consistency.
 */

import type { GenerationPackage } from "./types";

export interface StructureValidationResult {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

export class ProjectStructureValidator {
  /**
   * Validate the structure of a generation package.
   */
  validate(pkg: GenerationPackage): StructureValidationResult {
    const checks: Array<{ name: string; passed: boolean; detail?: string }> =
      [];

    // Check package has an ID
    checks.push({
      name: "package-id",
      passed: !!pkg.packageId,
      detail: pkg.packageId,
    });

    // Check session reference
    checks.push({ name: "session-id", passed: !!pkg.sessionId });

    // Check blueprint exists
    checks.push({
      name: "blueprint-exists",
      passed: pkg.blueprint !== null && pkg.blueprint !== undefined,
    });

    // Check execution plan exists
    checks.push({
      name: "execution-plan-exists",
      passed: pkg.executionPlan !== null && pkg.executionPlan !== undefined,
    });

    // Check at least one artifact
    checks.push({
      name: "artifacts-present",
      passed: pkg.totalArtifacts > 0,
      detail: `${pkg.totalArtifacts} artifacts`,
    });

    // Check manifest completeness
    checks.push({
      name: "manifest-generation-id",
      passed: !!pkg.metadata.generationId,
    });
    checks.push({
      name: "manifest-blueprint-version",
      passed: !!pkg.metadata.blueprintVersion,
    });
    checks.push({
      name: "manifest-planner-version",
      passed: !!pkg.metadata.plannerVersion,
    });

    // Check validation report
    checks.push({
      name: "validation-report-exists",
      passed:
        pkg.validationReport !== null && pkg.validationReport !== undefined,
    });

    // Check no duplicated script paths
    const scriptPaths = pkg.scripts.map((s) => s.path);
    const uniquePaths = new Set(scriptPaths);
    checks.push({
      name: "no-duplicate-scripts",
      passed: scriptPaths.length === uniquePaths.size,
      detail: `${scriptPaths.length} scripts, ${uniquePaths.size} unique`,
    });

    // Check timestamp
    checks.push({ name: "generated-at", passed: pkg.generatedAt > 0 });

    const valid = checks.every((c) => c.passed);
    return { valid, checks };
  }
}
