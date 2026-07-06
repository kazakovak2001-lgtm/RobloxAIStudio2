/**
 * StudioImportValidator.ts
 *
 * Validates a GenerationPackage before synchronization to Studio.
 */

import type { GenerationPackage } from "../../generation/coordinator/types";
import type { ImportValidationReport } from "./types";

export class StudioImportValidator {
  validate(pkg: GenerationPackage): ImportValidationReport {
    const checks: ImportValidationReport["checks"] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Package ID
    checks.push({ name: "package-id", passed: !!pkg.packageId });
    if (!pkg.packageId) errors.push("Package missing ID");

    // Has artifacts
    const hasArtifacts = pkg.totalArtifacts > 0;
    checks.push({
      name: "has-artifacts",
      passed: hasArtifacts,
      detail: `${pkg.totalArtifacts} artifacts`,
    });
    if (!hasArtifacts) errors.push("Package has no artifacts");

    // Scripts valid
    const scriptsValid = pkg.scripts.every(
      (s) => s.content !== null && s.content !== undefined,
    );
    checks.push({
      name: "scripts-valid",
      passed: scriptsValid,
      detail: `${pkg.scripts.length} scripts`,
    });
    if (!scriptsValid) errors.push("One or more scripts have null content");

    // No duplicate paths
    const paths = new Set<string>();
    let dupes = 0;
    for (const s of pkg.scripts) {
      if (paths.has(s.path)) dupes++;
      paths.add(s.path);
    }
    for (const c of pkg.configs) {
      if (paths.has(c.path)) dupes++;
      paths.add(c.path);
    }
    checks.push({
      name: "no-duplicate-paths",
      passed: dupes === 0,
      detail: `${dupes} duplicates`,
    });
    if (dupes > 0) errors.push(`${dupes} duplicate paths detected`);

    // Manifest present
    const hasManifest = !!pkg.metadata && !!pkg.metadata.generationId;
    checks.push({ name: "manifest-present", passed: hasManifest });
    if (!hasManifest) errors.push("Package missing generation manifest");

    // Validation report
    const reportValid = pkg.validationReport !== null;
    checks.push({ name: "validation-report", passed: reportValid });
    if (!reportValid) warnings.push("Package has no validation report");

    // Size reasonable (<100MB)
    const sizeOk = pkg.totalSizeBytes < 100_000_000;
    checks.push({
      name: "size-reasonable",
      passed: sizeOk,
      detail: `${Math.round(pkg.totalSizeBytes / 1024)}KB`,
    });
    if (!sizeOk) errors.push("Package exceeds 100MB size limit");

    // Blueprint present
    checks.push({
      name: "blueprint-present",
      passed: pkg.blueprint !== null && pkg.blueprint !== undefined,
    });

    return {
      valid: errors.length === 0,
      packageId: pkg.packageId,
      checks,
      errors,
      warnings,
    };
  }
}
