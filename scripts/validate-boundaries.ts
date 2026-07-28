import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { ImportBoundaryValidator } from "../server/src/core/architecture/ImportBoundaryValidator";
import { buildAstImportInventory } from "./architecture/ast-import-inventory";

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, "architecture.manifest.json");
const REPORT_PATH = join(ROOT, "boundary-report.json");

interface LayerDefinition {
  modules?: string[];
  canImportFrom?: string[];
}

interface AllowedLayerEdge {
  from: string;
  to: string;
  reason: string;
}

interface ArchitectureManifest {
  domains: Record<string, { path: string; layer: string }>;
  layers: Record<string, LayerDefinition>;
  allowedCycles?: string[][];
  allowedLayerEdges?: AllowedLayerEdge[];
  excludedTopLevelEntries?: Array<{ name: string; reason: string }>;
}

interface LayerViolation {
  sourceLayer: string;
  targetLayer: string;
  sourceDomain: string;
  targetDomain: string;
  file: string;
  importPath: string;
}

function canonicalCycle(cycle: string[]): string {
  const closesCycle = cycle.length > 1 && cycle[0] === cycle.at(-1);
  const clean = closesCycle ? cycle.slice(0, -1) : [...cycle];
  if (clean.length === 0) return "";

  return clean
    .map((_, index) =>
      [...clean.slice(index), ...clean.slice(0, index)].join("→"),
    )
    .sort()[0];
}

function layerEdgeKey(from: string, to: string): string {
  return `${from}→${to}`;
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
      errors.push(
        `Domain '${domain}' is outside server/src: '${definition.path}'.`,
      );
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

  for (const subsystem of modeledByTopLevel.keys()) {
    if (!realSubsystems.includes(subsystem)) {
      errors.push(`Manifest models non-subsystem path: '${subsystem}'.`);
    }
  }

  for (const [layerName, layer] of Object.entries(manifest.layers)) {
    for (const domain of layer.modules ?? []) {
      const definition = manifest.domains[domain];
      if (!definition) {
        errors.push(`Layer '${layerName}' lists unknown domain '${domain}'.`);
      } else if (definition.layer !== layerName) {
        errors.push(
          `Layer '${layerName}' lists '${domain}', but the domain declares '${definition.layer}'.`,
        );
      }
    }

    for (const importedLayer of layer.canImportFrom ?? []) {
      if (!manifest.layers[importedLayer]) {
        errors.push(
          `Layer '${layerName}' can import from unknown layer '${importedLayer}'.`,
        );
      }
    }
  }

  for (const exception of manifest.allowedLayerEdges ?? []) {
    const source = manifest.layers[exception.from];
    const target = manifest.layers[exception.to];
    if (!source || !target) {
      errors.push(
        `Allowed layer edge '${exception.from} → ${exception.to}' references an unknown layer.`,
      );
    } else if ((source.canImportFrom ?? []).includes(exception.to)) {
      errors.push(
        `Allowed layer edge '${exception.from} → ${exception.to}' is stale because the edge is already permitted.`,
      );
    }

    if (!exception.reason.trim()) {
      errors.push(
        `Allowed layer edge '${exception.from} → ${exception.to}' requires a reason.`,
      );
    }
  }

  return errors;
}

function collectLayerViolations(
  manifest: ArchitectureManifest,
  validator: ImportBoundaryValidator,
  edges: ReturnType<typeof buildAstImportInventory>["edges"],
): LayerViolation[] {
  const violations: LayerViolation[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const sourceLayer = validator.resolveLayer(edge.from);
    const targetLayer = validator.resolveLayer(edge.to);
    if (sourceLayer === targetLayer) continue;

    const allowedLayers = manifest.layers[sourceLayer]?.canImportFrom ?? [];
    if (allowedLayers.includes(targetLayer)) continue;

    const key = [edge.file, edge.importPath, edge.from, edge.to].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    violations.push({
      sourceLayer,
      targetLayer,
      sourceDomain: edge.from,
      targetDomain: edge.to,
      file: edge.file,
      importPath: edge.importPath,
    });
  }

  return violations;
}

function printLayerViolations(
  title: string,
  violations: LayerViolation[],
): void {
  if (violations.length === 0) return;

  console.error(title);
  for (const violation of violations.slice(0, 20)) {
    const edge = `${violation.sourceLayer} → ${violation.targetLayer}`;
    console.error(`    ${edge}: ${violation.file}`);
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
  const manifestErrors = validateManifest(manifest);
  const validator = new ImportBoundaryValidator(ROOT);
  const result = validator.scanProject();
  const astInventory = buildAstImportInventory(ROOT, validator);
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
  const unresolvedInternalImports = astInventory.unresolvedInternalImports;
  const layerViolations = collectLayerViolations(
    manifest,
    validator,
    astInventory.edges,
  );
  const allowedLayerEdges = new Set(
    (manifest.allowedLayerEdges ?? []).map((edge) =>
      layerEdgeKey(edge.from, edge.to),
    ),
  );
  const acknowledgedLayerViolations = layerViolations.filter((violation) =>
    allowedLayerEdges.has(
      layerEdgeKey(violation.sourceLayer, violation.targetLayer),
    ),
  );
  const unexpectedLayerViolations = layerViolations.filter(
    (violation) =>
      !allowedLayerEdges.has(
        layerEdgeKey(violation.sourceLayer, violation.targetLayer),
      ),
  );

  const failed =
    manifestErrors.length > 0 ||
    criticalViolations.length > 0 ||
    unexpectedCycles.length > 0 ||
    unresolvedInternalImports.length > 0 ||
    unexpectedLayerViolations.length > 0;

  const report = {
    ...baseReport,
    status: failed ? "FAIL" : "PASS",
    astInventory: {
      filesScanned: astInventory.filesScanned,
      specificationsAnalyzed: astInventory.specificationsAnalyzed,
      reExportsAnalyzed: astInventory.reExportsAnalyzed,
      internalEdges: astInventory.edges.length,
      unresolvedInternalImports,
    },
    layerEnforcement: {
      acknowledgedViolations: acknowledgedLayerViolations,
      unexpectedViolations: unexpectedLayerViolations,
    },
    gate: {
      manifestErrors,
      criticalViolationCount: criticalViolations.length,
      acknowledgedCycles,
      unexpectedCycles,
      unresolvedInternalImportCount: unresolvedInternalImports.length,
      acknowledgedLayerViolationCount: acknowledgedLayerViolations.length,
      unexpectedLayerViolationCount: unexpectedLayerViolations.length,
      exitCode: failed ? 1 : 0,
    },
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(`  Files scanned:       ${result.filesScanned}`);
  console.log(`  Regex imports:       ${result.importsAnalyzed}`);
  console.log(`  AST specifications:  ${astInventory.specificationsAnalyzed}`);
  console.log(`  AST re-exports:      ${astInventory.reExportsAnalyzed}`);
  console.log(`  AST internal edges:  ${astInventory.edges.length}`);
  console.log(`  AST unresolved:      ${unresolvedInternalImports.length}`);
  console.log(`  Domain edges:        ${result.edges.length}`);
  console.log(`  Manifest errors:     ${manifestErrors.length}`);
  console.log(`  Allowed cycles:      ${acknowledgedCycles.length}`);
  console.log(`  Unexpected cycles:   ${unexpectedCycles.length}`);
  console.log(`  Allowed layer debt:  ${acknowledgedLayerViolations.length}`);
  console.log(`  Layer violations:    ${unexpectedLayerViolations.length}`);
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

  if (acknowledgedLayerViolations.length > 0) {
    console.warn("  ⚠️  TEMPORARILY ALLOWLISTED LAYER DEBT:");
    const pairs = new Set(
      acknowledgedLayerViolations.map((violation) =>
        layerEdgeKey(violation.sourceLayer, violation.targetLayer),
      ),
    );
    for (const pair of pairs) console.warn(`    ${pair}`);
    console.warn("");
  }

  printLayerViolations(
    "  ❌ NON-ALLOWLISTED LAYER VIOLATIONS:",
    unexpectedLayerViolations,
  );

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
    console.error("  ❌ FAIL — architecture gate rejected the repository state.");
    console.error("  Report saved to: boundary-report.json");
    process.exit(1);
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