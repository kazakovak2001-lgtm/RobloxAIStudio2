/**
 * scan-imports.ts — Static Analysis Import Scanner
 *
 * Scans the entire server/src tree and produces a full dependency graph
 * with domain-level resolution, violation detection, and JSON output.
 *
 * Usage:
 *   npx tsx scripts/scan-imports.ts
 *   npx tsx scripts/scan-imports.ts --json    (JSON-only output)
 *   npx tsx scripts/scan-imports.ts --verbose (show all edges)
 *
 * Output:
 *   - Console summary
 *   - import-graph.json (full dependency data)
 */

import { ImportBoundaryValidator } from "../server/src/core/architecture/ImportBoundaryValidator";
import { writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const verbose = args.includes("--verbose");

function main(): void {
  const validator = new ImportBoundaryValidator(ROOT);
  const result = validator.scanProject();
  const report = validator.generateReport(result);

  // Write full report
  const outputPath = join(ROOT, "import-graph.json");
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Import Dependency Scanner                       ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log(`  Files scanned:    ${result.filesScanned}`);
  console.log(`  Imports analyzed: ${result.importsAnalyzed}`);
  console.log("");

  // Domain-level summary
  const domainEdges = new Map<string, Set<string>>();
  for (const edge of result.edges) {
    if (edge.from === edge.to) continue;
    if (!domainEdges.has(edge.from)) domainEdges.set(edge.from, new Set());
    domainEdges.get(edge.from)!.add(edge.to);
  }

  console.log("  DOMAIN DEPENDENCY GRAPH:");
  const sortedDomains = [...domainEdges.keys()].sort();
  for (const domain of sortedDomains) {
    const deps = [...(domainEdges.get(domain) ?? [])].sort();
    console.log(`    ${domain} → [${deps.join(", ")}]`);
  }
  console.log("");

  if (result.circularDeps.length > 0) {
    console.warn("  ⚠️  CIRCULAR DEPENDENCIES:");
    for (const cycle of result.circularDeps) {
      console.warn(`    ${cycle.join(" → ")}`);
    }
    console.warn("");
  }

  if (result.violations.length > 0) {
    console.error(`  ❌ VIOLATIONS: ${result.violations.length}`);
    for (const v of result.violations.slice(0, 20)) {
      console.error(`    [${v.severity}] ${v.file}: ${v.rule}`);
    }
    if (result.violations.length > 20) {
      console.error(`    ... and ${result.violations.length - 20} more`);
    }
    console.error("");
  }

  if (verbose) {
    console.log("  ALL EDGES:");
    for (const edge of result.edges) {
      if (edge.from !== edge.to) {
        console.log(
          `    ${edge.file}: ${edge.from} → ${edge.to} (${edge.importPath})`,
        );
      }
    }
  }

  console.log(`\n  Report saved to: import-graph.json`);
}

main();
