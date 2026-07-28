/**
 * validate-boundaries.ts — protected architecture boundary gate.
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL
 *
 * The JSON report, console summary and process exit code are derived from the
 * same gate decision. A manifest configuration error, critical import
 * violation or non-allowlisted cycle fails the command.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { ImportBoundaryValidator } from "../server/src/core/architecture/ImportBoundaryValidator";

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, "architecture.manifest.json");
const REPORT_PATH = join(ROOT, "boundary-report.json");

interface ArchitectureManifest {
  domains: Record<string, { path: string; layer: string }>;
  layers: Record<string, { modules?: string[] }>;
  allowedCycles?: string[][];
  excludedTopLevelEntries?: Array<{ name: string; reason: string }>;
}

function canonicalCycle(cycle: string[]): string {
  const clean =
    cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]
      ? cycle.slice(0, -1)
      : [...cycle];

  if (clean.length === 0) return "";

  const rotations = clean.map((_, index) =>
    [...clean.slice(index), ...clean.slice(0, index)].join("→"),
  );

  return rotations.sort()[0];
}

function validateManifest(manifest: ArchitectureManifest): string[] {
  const errors: string[] = [];
  const serverSrc = join(ROOT, "server", "src");
  const exclusions = new Set(
    (manifest.excludedTopLevelEntries ?? []).map((entry) => entry.name),
  );

  const realSubsystems = readdirSync(serverSrc, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !exclusions.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  const modeledByTopLevel = new Map<string, string>();

  for (const [domain, definition] of Object.entries(manifest.domains)) {
    const absolutePath = join(ROOT, definition.path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      errors.push(
        `Domain '${domain}' points to missing directory '${definition.path}'.`,
      );
      continue;
    }

    const relativePath = relative(serverSrc, absolutePath).replaceAll("\\", "/");
    const topLevel = relativePath.split("/")[0];
    if (!topLevel || topLevel.startsWith("..")) {
      errors.push(`Domain '${domain}' is outside server/src: '${definition.path}'.`);
      continue;
    }

    const previous = modeledByTopLevel.get(topLevel);
    if (previous) {
      errors.push(
        `Subsystem '${topLevel}' is modeled by both '${previous}' and '${domain}'.`,
      );
    } else {
      modeledByTopLevel.set(topLevel, domain);
    }

    const layer = manifest.layers[definition.layer];
    if (!layer) {
      errors.push(
        `Domain '${domain}' references unknown layer '${definition.layer}'.`,
      );
    } else if (layer.modules && !layer.modules.includes(domain)) {
      errors.push(
        `Layer '${definition.layer}' does not list domain '${domain}'.`,
      );
    }
  }

  for (const subsystem of realSubsystems) {
    if (!modeledByTopLevel.has(subsystem)) {
      errors.push(`Unmodeled server/src subsystem: '${subsystem}'.`);
    }
  }

  for (const modeledSubsystem of modeledByTopLevel.keys()) {
    if (!realSubsystems.includes(modeledSubsystem)) {
      errors.push(`Manifest models non-subsystem path: '${modeledSubsystem}'.`);
    }
  }

  for (const [layerName, layer] of Object.entries(manifest.layers)) {
    for (const domain of layer.modules ?? []) {
      if (!manifest.domains[domain]) {
        errors.push(`Layer '${layerName}' lists unknown domain '${domain}'.`);
      } else if (manifest.domains[domain].layer !== layerName) {
        errors.push(
          `Layer '${layerName}' lists '${domain}', but the domain declares '${manifest.domains[domain].layer}'.`,
        );
      }
    }
  }

  return errors;
}

function main(): void {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Architecture Boundary Firewall v2.0             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8"),
  ) as ArchitectureManifest;
  const manifestErrors = validateManifest(manifest);

  const validator = new ImportBoundaryValidator(ROOT);
  const result = validator.scanProject();
  const baseReport = validator.generateReport(result);

  const allowedCycles = new Set(
    (manifest.allowedCycles ?? []).map(canonicalCycle),
  );
  const unexpectedCycles = result.circularDeps.filter(
    (cycle) => !allowedCycles.has(canonicalCycle(cycle)),
  );
  const acknowledgedCycles = result.circularDeps.filter((cycle) =>
    allowedCycles.has(canonicalCycle(cycle)),
  );
  const criticalViolations = result.violations.filter(
    (violation) => violation.severity === "critical",
  );

  const failed =
    manifestErrors.length > 0 ||
    criticalViolations.length > 0 ||
    unexpectedCycles.length > 0;

  const report = {
    ...baseReport,
    status: failed ? "FAIL" : "PASS",
    gate: {
      manifestErrors,
      criticalViolationCount: criticalViolations.length,
      acknowledgedCycles,
      unexpectedCycles,
      exitCode: failed ? 1 : 0,
    },
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(`  Files scanned:       ${result.filesScanned}`);
  console.log(`  Imports analyzed:    ${result.importsAnalyzed}`);
  console.log(`  Domain edges:        ${result.edges.length}`);
  console.log(`  Manifest errors:     ${manifestErrors.length}`);
  console.log(`  Allowed cycles:      ${acknowledgedCycles.length}`);
  console.log(`  Unexpected cycles:   ${unexpectedCycles.length}`);
  console.log(`  Violations:          ${result.violations.length}`);
  console.log("");

  if (manifestErrors.length > 0) {
    console.error("  ❌ MANIFEST CONFIGURATION ERRORS:\n");
    for (const error of manifestErrors) console.error(`    - ${error}`);
    console.error("");
  }

  if (acknowledgedCycles.length > 0) {
    console.warn("  ⚠️  TEMPORARILY ALLOWLISTED CYCLES:");
    for (const cycle of acknowledgedCycles) {
      console.warn(`    ${cycle.join(" → ")}`);
    }
    console.warn("");
  }

  if (unexpectedCycles.length > 0) {
    console.error("  ❌ NON-ALLOWLISTED CIRCULAR DEPENDENCIES:");
    for (const cycle of unexpectedCycles) {
      console.error(`    ${cycle.join(" → ")}`);
    }
    console.error("");
  }

  if (result.violations.length > 0) {
    console.error("  ❌ BOUNDARY VIOLATIONS:\n");
    for (const violation of result.violations) {
      console.error(
        `  [${violation.severity.toUpperCase()}] ${violation.rule}`,
      );
      console.error(`    File:   ${violation.file}`);
      console.error(`    Import: ${violation.importPath}`);
      console.error(`    ${violation.sourceDomain} → ${violation.targetDomain}`);
      console.error(`    ${violation.message}\n`);
    }
  }

  if (failed) {
    console.error(
      "  ❌ FAIL — architecture gate rejected the repository state.",
    );
    console.error("  Report saved to: boundary-report.json");
    process.exit(1);
  }

  if (result.violations.length > 0) {
    console.warn(
      `  ⚠️  PASS WITH WARNINGS — ${result.violations.length} non-critical violation(s).`,
    );
  } else {
    console.log(
      "  ✅ PASS — manifest, cycles and critical boundaries are valid.",
    );
  }
  console.log("  Architecture Model: EXHAUSTIVE DOMAIN-ISOLATED PLATFORM");
  console.log("  Report saved to: boundary-report.json");
  process.exit(0);
}

main();
