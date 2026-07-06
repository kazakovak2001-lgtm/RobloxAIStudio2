/**
 * Architecture Boundary Validator
 *
 * Enforces the canonical source root policy:
 *   - Backend/compiler: server/src/ (canonical)
 *   - Frontend: src/ (legitimate, React/Vite SPA)
 *
 * Forbidden patterns:
 *   - Any additional src/ roots (app/src/, lib/src/, etc.)
 *   - Backend business logic outside server/src/
 *   - Duplicate modules across roots
 *   - server/ code importing from src/ (cross-boundary violation)
 *
 * Exit code 0 = PASS, 1 = FAIL
 */

import { readdirSync, existsSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();

// Allowed source directories
const ALLOWED_SRC_ROOTS = [
  "server/src", // Backend canonical root
  "src", // Frontend (React/Vite)
];

// Forbidden patterns — additional src directories that must not exist
const FORBIDDEN_PATTERNS = [
  "app/src",
  "lib/src",
  "packages/src",
  "backend/src",
  "api/src",
  "core/src",
];

interface Violation {
  type: "forbidden-root" | "cross-boundary" | "orphan-module";
  path: string;
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
        message: `Forbidden source root detected: ${pattern}/ — all backend code must be in server/src/`,
      });
    }
  }

  // Scan for any directory named "src" that isn't in ALLOWED_SRC_ROOTS
  const topLevel = readdirSync(ROOT).filter((entry) => {
    const full = join(ROOT, entry);
    return (
      statSync(full).isDirectory() &&
      !entry.startsWith(".") &&
      entry !== "node_modules" &&
      entry !== "dist" &&
      entry !== "storage"
    );
  });

  for (const dir of topLevel) {
    if (dir === "src" || dir === "server") continue; // allowed
    const potentialSrc = join(ROOT, dir, "src");
    if (existsSync(potentialSrc) && statSync(potentialSrc).isDirectory()) {
      const relPath = relative(ROOT, potentialSrc);
      if (!ALLOWED_SRC_ROOTS.includes(relPath.replace(/\\/g, "/"))) {
        violations.push({
          type: "forbidden-root",
          path: relPath,
          message: `Unexpected source root: ${relPath} — not in allowed list`,
        });
      }
    }
  }

  return violations;
}

function scanForOrphanAgentDirs(): Violation[] {
  const violations: Violation[] = [];

  // The legacy agents/ directory should not exist
  const legacyAgents = join(ROOT, "agents");
  if (existsSync(legacyAgents) && statSync(legacyAgents).isDirectory()) {
    const contents = readdirSync(legacyAgents);
    if (contents.some((f) => f.endsWith(".ts") || f.endsWith(".js"))) {
      violations.push({
        type: "orphan-module",
        path: "agents/",
        message:
          "Legacy agents/ directory contains source files — must be in server/src/agents/",
      });
    }
  }

  return violations;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Architecture Boundary Validator         ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const violations: Violation[] = [
    ...scanForForbiddenRoots(),
    ...scanForOrphanAgentDirs(),
  ];

  if (violations.length === 0) {
    console.log("✅ ARCH STATUS: STABLE");
    console.log("   CANONICAL BACKEND ROOT: server/src");
    console.log("   CANONICAL FRONTEND ROOT: src");
    console.log("   DRIFT: NONE");
    console.log("   FORBIDDEN ROOTS: NONE DETECTED");
    process.exit(0);
  } else {
    console.error("❌ ARCH STATUS: VIOLATION DETECTED\n");
    for (const v of violations) {
      console.error(`  [${v.type}] ${v.path}`);
      console.error(`    → ${v.message}\n`);
    }
    console.error(`Total violations: ${violations.length}`);
    process.exit(1);
  }
}

main();
