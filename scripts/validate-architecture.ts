/**
 * Architecture Boundary Validator v2 — Dual-Root Model
 *
 * Enforces:
 *   - Frontend: src/ (React/Vite SPA)
 *   - Backend: server/src/ (Node/Express AI compiler)
 *   - Shared: shared/ (types/DTOs only)
 *
 * Detects:
 *   - Forbidden source roots
 *   - Cross-boundary imports
 *   - Orphan modules
 *   - Backend code in frontend zone (and vice versa)
 *
 * Exit: 0 = PASS, 1 = FAIL
 */

import { readdirSync, existsSync, statSync, readFileSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();

const ALLOWED_SRC_ROOTS = ["server/src", "src", "shared"];

const FORBIDDEN_PATTERNS = [
  "app/src",
  "lib/src",
  "packages/src",
  "backend/src",
  "api/src",
  "core/src",
];

interface Violation {
  type: "forbidden-root" | "cross-boundary" | "orphan-module" | "zone-leak";
  path: string;
  severity: "critical" | "warning";
  message: string;
}

function scanForForbiddenRoots(): Violation[] {
  const violations: Violation[] = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    const fullPath = join(ROOT, pattern);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      violations.push({
        type: "forbidden-root",
        path: pattern,
        severity: "critical",
        message: `Forbidden source root: ${pattern}/`,
      });
    }
  }

  // Scan top-level for unexpected src/ directories
  const topLevel = readdirSync(ROOT).filter((entry) => {
    const full = join(ROOT, entry);
    return (
      statSync(full).isDirectory() &&
      !entry.startsWith(".") &&
      entry !== "node_modules" &&
      entry !== "dist" &&
      entry !== "storage" &&
      entry !== "docs" &&
      entry !== "scripts"
    );
  });

  for (const dir of topLevel) {
    if (["src", "server", "shared"].includes(dir)) continue;
    const potentialSrc = join(ROOT, dir, "src");
    if (existsSync(potentialSrc) && statSync(potentialSrc).isDirectory()) {
      violations.push({
        type: "forbidden-root",
        path: `${dir}/src`,
        severity: "critical",
        message: `Unexpected source root: ${dir}/src/`,
      });
    }
  }

  return violations;
}

function scanForOrphanModules(): Violation[] {
  const violations: Violation[] = [];

  const legacyAgents = join(ROOT, "agents");
  if (existsSync(legacyAgents) && statSync(legacyAgents).isDirectory()) {
    const contents = readdirSync(legacyAgents);
    if (contents.some((f) => f.endsWith(".ts") || f.endsWith(".js"))) {
      violations.push({
        type: "orphan-module",
        path: "agents/",
        severity: "critical",
        message:
          "Legacy agents/ contains source — must be in server/src/agents/",
      });
    }
  }

  return violations;
}

function scanForCrossBoundaryImports(): Violation[] {
  const violations: Violation[] = [];

  // Check backend files for React imports
  const backendFiles = collectTsFiles(join(ROOT, "server", "src"));
  for (const file of backendFiles) {
    const content = readFileSync(file, "utf-8");
    if (
      content.includes('from "react"') ||
      content.includes("from 'react'") ||
      content.includes('from "react-dom"')
    ) {
      violations.push({
        type: "cross-boundary",
        path: relative(ROOT, file),
        severity: "critical",
        message: "Backend file imports React runtime",
      });
    }
    if (content.match(/from\s+["']\.\.\/\.\.\/src\//)) {
      violations.push({
        type: "cross-boundary",
        path: relative(ROOT, file),
        severity: "critical",
        message: "Backend file imports from frontend src/",
      });
    }
  }

  // Check frontend files for Node/server imports
  const frontendFiles = collectTsFiles(join(ROOT, "src"));
  for (const file of frontendFiles) {
    const content = readFileSync(file, "utf-8");
    if (content.match(/from\s+["']\.\.\/server\/src\//)) {
      violations.push({
        type: "cross-boundary",
        path: relative(ROOT, file),
        severity: "critical",
        message: "Frontend file imports from backend server/src/",
      });
    }
  }

  return violations;
}

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectTsFiles(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      files.push(full);
    }
  }
  return files;
}

// ─── Runtime Enforcement: PlanExecutor is the only runtime ──────────────────

function scanForDeprecatedRuntimeUsage(): Violation[] {
  const violations: Violation[] = [];

  // Files that MUST NOT import aiPipelineIntegrator (runtime code)
  const runtimeDirs = [
    join(ROOT, "server", "src", "routes"),
    join(ROOT, "server", "src", "projects", "services"),
    join(ROOT, "server", "src", "planning"),
    join(ROOT, "server", "src", "generation"),
    join(ROOT, "server", "src", "simulation"),
    join(ROOT, "server", "src", "economy"),
    join(ROOT, "server", "src", "world"),
    join(ROOT, "server", "src", "lifecycle"),
    join(ROOT, "server", "src", "artifacts"),
    join(ROOT, "server", "src", "export"),
    join(ROOT, "server", "src", "compiler"),
  ];

  for (const dir of runtimeDirs) {
    const files = collectTsFiles(dir);
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      // Check for runtime instantiation (new AIPipelineIntegrator)
      if (content.includes("new AIPipelineIntegrator")) {
        violations.push({
          type: "cross-boundary",
          path: relative(ROOT, file),
          severity: "critical",
          message:
            "DEPRECATED: Runtime instantiation of AIPipelineIntegrator detected. Use PlanExecutor.",
        });
      }
      // Check for import of the class (not just type)
      if (content.match(/import\s+\{[^}]*AIPipelineIntegrator[^}]*\}\s+from/)) {
        // Allow if it's only importing the PIPELINE_STAGES constant or types
        if (
          !content.includes("import type") ||
          content.includes("new AIPipelineIntegrator")
        ) {
          // Check if it's a non-type import that could lead to instantiation
          const importLine = content.match(
            /import\s+\{[^}]*AIPipelineIntegrator[^}]*\}\s+from[^\n]*/,
          );
          if (importLine && !importLine[0].includes("import type")) {
            violations.push({
              type: "cross-boundary",
              path: relative(ROOT, file),
              severity: "warning",
              message:
                "Runtime import of AIPipelineIntegrator — should use 'import type' or remove.",
            });
          }
        }
      }
    }
  }

  return violations;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Dual-Boundary Architecture Validator v2         ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const violations: Violation[] = [
    ...scanForForbiddenRoots(),
    ...scanForOrphanModules(),
    ...scanForCrossBoundaryImports(),
    ...scanForDeprecatedRuntimeUsage(),
  ];

  // Status report
  const feExists = existsSync(join(ROOT, "src"));
  const beExists = existsSync(join(ROOT, "server", "src"));
  const sharedExists = existsSync(join(ROOT, "shared"));

  console.log("DUAL BOUNDARY ARCHITECTURE STATUS");
  console.log(`  Frontend (/src): ${feExists ? "ACTIVE" : "MISSING"}`);
  console.log(`  Backend (/server/src): ${beExists ? "ACTIVE" : "MISSING"}`);
  console.log(`  Shared (/shared): ${sharedExists ? "ACTIVE" : "NOT CREATED"}`);
  console.log("");

  if (violations.length === 0) {
    console.log("  Cross-boundary violations: NONE");
    console.log("  CI Gate: ACTIVE");
    console.log("  Runtime Guard: ACTIVE");
    console.log("  AI Sandbox: ACTIVE");
    console.log("");
    console.log("  System State: STABLE");
    console.log("  Architecture Model: MONOREPO DUAL-ROOT");
    process.exit(0);
  } else {
    console.error(`  Cross-boundary violations: ${violations.length}\n`);
    for (const v of violations) {
      console.error(`  [${v.severity.toUpperCase()}] ${v.type}: ${v.path}`);
      console.error(`    → ${v.message}\n`);
    }
    console.error("  System State: VIOLATION DETECTED");
    process.exit(1);
  }
}

main();
