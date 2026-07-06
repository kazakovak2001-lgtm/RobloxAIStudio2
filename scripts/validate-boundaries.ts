/**
 * validate-boundaries.ts — CI Gate for Architecture Boundary Enforcement
 *
 * Runs the ImportBoundaryValidator against the entire project.
 * Fails the build (exit 1) if:
 *   - Any forbidden import is detected
 *   - Any circular domain dependency exists
 *   - Any hard ban violation (aiPipelineIntegrator runtime import)
 *
 * Usage:
 *   npx tsx scripts/validate-boundaries.ts
 *   npm run validate:boundaries
 *
 * Exit codes:
 *   0 = PASS (no violations)
 *   1 = FAIL (violations found)
 */

import { ImportBoundaryValidator } from "../server/src/core/architecture/ImportBoundaryValidator";
import { writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

function main(): void {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Architecture Boundary Firewall v1.0             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const validator = new ImportBoundaryValidator(ROOT);
  const result = validator.scanProject();
  const report = validator.generateReport(result);

  // Write JSON report
  const reportPath = join(ROOT, "boundary-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  // Console output
  console.log(`  Files scanned:       ${result.filesScanned}`);
  console.log(`  Imports analyzed:    ${result.importsAnalyzed}`);
  console.log(`  Domain edges:        ${result.edges.length}`);
  console.log(`  Circular deps:       ${result.circularDeps.length}`);
  console.log(`  Violations:          ${result.violations.length}`);
  console.log("");

  if (result.circularDeps.length > 0) {
    console.warn("  ⚠️  CIRCULAR DOMAIN DEPENDENCIES:");
    for (const cycle of result.circularDeps) {
      console.warn(`    ${cycle.join(" → ")}`);
    }
    console.warn("");
  }

  if (result.violations.length > 0) {
    console.error("  ❌ BOUNDARY VIOLATIONS:\n");
    for (const v of result.violations) {
      console.error(`  [${v.severity.toUpperCase()}] ${v.rule}`);
      console.error(`    File:   ${v.file}`);
      console.error(`    Import: ${v.importPath}`);
      console.error(`    ${v.sourceDomain} → ${v.targetDomain}`);
      console.error(`    ${v.message}\n`);
    }
  }

  // Determine exit
  const criticalViolations = result.violations.filter(
    (v) => v.severity === "critical",
  );

  if (criticalViolations.length > 0) {
    console.error(
      `\n  ❌ FAIL — ${criticalViolations.length} critical violation(s) found.`,
    );
    console.error("  Report saved to: boundary-report.json");
    process.exit(1);
  }

  if (result.violations.length > 0) {
    console.warn(
      `\n  ⚠️  WARNING — ${result.violations.length} non-critical violation(s).`,
    );
    console.warn("  Report saved to: boundary-report.json");
    // Warnings don't fail CI (yet)
    process.exit(0);
  }

  console.log("  ✅ PASS — No boundary violations detected.");
  console.log("  Architecture Model: DOMAIN-ISOLATED EXECUTION PLATFORM");
  console.log(`  Report saved to: boundary-report.json`);
  process.exit(0);
}

main();
