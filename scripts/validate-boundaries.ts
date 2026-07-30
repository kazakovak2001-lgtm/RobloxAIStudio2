import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ImportBoundaryValidator } from "../server/src/core/architecture/ImportBoundaryValidator";
import { buildAstImportInventory } from "./architecture/ast-import-inventory";
import {
  collectLayerViolations,
  evaluateBoundaryGate,
  layerEdgeKey,
  validateManifestModel,
  type ArchitectureManifest,
  type LayerViolation,
} from "./architecture/boundary-gate-core";

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, "architecture.manifest.json");
const REPORT_PATH = join(ROOT, "boundary-report.json");

function readRealSubsystems(manifest: ArchitectureManifest): string[] {
  const exclusions = new Set(
    (manifest.excludedTopLevelEntries ?? []).map((entry) => entry.name),
  );

  return readdirSync(join(ROOT, "server", "src"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !exclusions.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function validateDomainDirectories(manifest: ArchitectureManifest): string[] {
  const errors: string[] = [];
  for (const [domain, definition] of Object.entries(manifest.domains)) {
    const absolutePath = join(ROOT, definition.path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      errors.push(
        `Domain '${domain}' points to missing directory '${definition.path}'.`,
      );
    }
  }
  return errors;
}

function validateActiveLayerExceptions(
  manifest: ArchitectureManifest,
  violations: readonly LayerViolation[],
): string[] {
  const activeEdges = new Set(
    violations.map((violation) =>
      layerEdgeKey(violation.sourceLayer, violation.targetLayer),
    ),
  );

  return (manifest.allowedLayerEdges ?? [])
    .filter((edge) => !activeEdges.has(layerEdgeKey(edge.from, edge.to)))
    .map(
      (edge) =>
        `Allowed layer edge '${edge.from} → ${edge.to}' is stale because no real AST edge requires it.`,
    );
}

function printLayerViolations(
  title: string,
  violations: readonly LayerViolation[],
): void {
  if (violations.length === 0) return;

  console.error(title);
  for (const violation of violations.slice(0, 20)) {
    console.error(
      `    ${violation.sourceLayer} → ${violation.targetLayer}: ${violation.file}`,
    );
    console.error(`      imports ${violation.importPath}`);
  }
  if (violations.length > 20) {
    console.error(
      `    ... ${violations.length - 20} additional violation(s) in boundary-report.json`,
    );
  }
  console.error("");
}

function main(): void {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Architecture Boundary Firewall v2.0             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8"),
  ) as ArchitectureManifest;
  const validator = new ImportBoundaryValidator(ROOT);
  const result = validator.scanProject();
  const astInventory = buildAstImportInventory(ROOT, validator);
  const baseReport = validator.generateReport(result);

  const realSubsystems = readRealSubsystems(manifest);
  const layerViolations = collectLayerViolations(manifest, astInventory.edges);
  const manifestErrors = [
    ...validateManifestModel(manifest, realSubsystems),
    ...validateDomainDirectories(manifest),
    ...validateActiveLayerExceptions(manifest, layerViolations),
  ];
  const criticalViolations = result.violations.filter(
    (violation) => violation.severity === "critical",
  );
  const excludedAstSources = new Set(
    (manifest.excludedTopLevelEntries ?? []).map(
      (entry) => `server/src/${entry.name}`,
    ),
  );
  const ignoredCompositionRootImports =
    astInventory.unresolvedInternalImports.filter((entry) =>
      excludedAstSources.has(entry.file),
    );
  const unresolvedInternalImports =
    astInventory.unresolvedInternalImports.filter(
      (entry) => !excludedAstSources.has(entry.file),
    );

  const decision = evaluateBoundaryGate({
    manifestErrors,
    criticalViolationCount: criticalViolations.length,
    cycles: result.circularDeps,
    unresolvedInternalImportCount: unresolvedInternalImports.length,
    layerViolations,
    allowedCycles: manifest.allowedCycles,
    allowedLayerEdges: manifest.allowedLayerEdges,
  });

  const report = {
    ...baseReport,
    status: decision.status,
    astInventory: {
      filesScanned: astInventory.filesScanned,
      specificationsAnalyzed: astInventory.specificationsAnalyzed,
      reExportsAnalyzed: astInventory.reExportsAnalyzed,
      internalEdges: astInventory.edges.length,
      unresolvedInternalImports,
      ignoredCompositionRootImports,
    },
    layerEnforcement: {
      acknowledgedViolations: decision.acknowledgedLayerViolations,
      unexpectedViolations: decision.unexpectedLayerViolations,
    },
    gate: {
      manifestErrors,
      criticalViolationCount: criticalViolations.length,
      acknowledgedCycles: decision.acknowledgedCycles,
      unexpectedCycles: decision.unexpectedCycles,
      unresolvedInternalImportCount: unresolvedInternalImports.length,
      acknowledgedLayerViolationCount:
        decision.acknowledgedLayerViolations.length,
      unexpectedLayerViolationCount: decision.unexpectedLayerViolations.length,
      reasons: decision.reasons,
      exitCode: decision.exitCode,
    },
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(`  Files scanned:       ${result.filesScanned}`);
  console.log(`  Regex imports:       ${result.importsAnalyzed}`);
  console.log(`  AST specifications:  ${astInventory.specificationsAnalyzed}`);
  console.log(`  AST re-exports:      ${astInventory.reExportsAnalyzed}`);
  console.log(`  AST internal edges:  ${astInventory.edges.length}`);
  console.log(`  AST unresolved:      ${unresolvedInternalImports.length}`);
  console.log(`  Composition imports: ${ignoredCompositionRootImports.length}`);
  console.log(`  Domain edges:        ${result.edges.length}`);
  console.log(`  Manifest errors:     ${manifestErrors.length}`);
  console.log(`  Allowed cycles:      ${decision.acknowledgedCycles.length}`);
  console.log(`  Unexpected cycles:   ${decision.unexpectedCycles.length}`);
  console.log(
    `  Allowed layer debt:  ${decision.acknowledgedLayerViolations.length}`,
  );
  console.log(
    `  Layer violations:    ${decision.unexpectedLayerViolations.length}`,
  );
  console.log(`  Violations:          ${result.violations.length}\n`);

  if (manifestErrors.length > 0) {
    console.error("  ❌ MANIFEST CONFIGURATION ERRORS:\n");
    for (const error of manifestErrors) console.error(`    - ${error}`);
    console.error("");
  }

  if (unresolvedInternalImports.length > 0) {
    console.error("  ❌ UNRESOLVED INTERNAL IMPORT DOMAINS:\n");
    for (const unresolved of unresolvedInternalImports) {
      console.error(`    ${unresolved.file}: ${unresolved.importPath}`);
    }
    console.error("");
  }

  if (decision.acknowledgedLayerViolations.length > 0) {
    console.warn("  ⚠️  TEMPORARILY ALLOWLISTED LAYER DEBT:");
    const pairs = new Set(
      decision.acknowledgedLayerViolations.map((violation) =>
        layerEdgeKey(violation.sourceLayer, violation.targetLayer),
      ),
    );
    for (const pair of pairs) console.warn(`    ${pair}`);
    console.warn("");
  }

  printLayerViolations(
    "  ❌ NON-ALLOWLISTED LAYER VIOLATIONS:",
    decision.unexpectedLayerViolations,
  );

  if (decision.acknowledgedCycles.length > 0) {
    console.warn("  ⚠️  TEMPORARILY ALLOWLISTED CYCLES:");
    for (const cycle of decision.acknowledgedCycles) {
      console.warn(`    ${cycle.join(" → ")}`);
    }
    console.warn("");
  }

  if (decision.unexpectedCycles.length > 0) {
    console.error("  ❌ NON-ALLOWLISTED CIRCULAR DEPENDENCIES:");
    for (const cycle of decision.unexpectedCycles) {
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
      console.error(
        `    ${violation.sourceDomain} → ${violation.targetDomain}`,
      );
      console.error(`    ${violation.message}\n`);
    }
  }

  if (decision.status === "FAIL") {
    console.error(
      "  ❌ FAIL — architecture gate rejected the repository state.",
    );
    console.error("  Report saved to: boundary-report.json");
    process.exit(decision.exitCode);
  }

  if (result.violations.length > 0) {
    console.warn(
      `  ⚠️  PASS WITH WARNINGS — ${result.violations.length} non-critical violation(s).`,
    );
  } else {
    console.log(
      "  ✅ PASS — manifest, AST inventory, layers, cycles and critical boundaries are valid.",
    );
  }
  console.log("  Architecture Model: EXHAUSTIVE DOMAIN-ISOLATED PLATFORM");
  console.log("  Report saved to: boundary-report.json");
}

main();
