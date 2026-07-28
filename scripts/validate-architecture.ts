/**
 * Architecture Boundary Validator v4 — Backend + Standalone Frontend Model
 *
 * Enforces:
 *   - Backend: server/src/ (Node/Express AI compiler)
 *   - Roblox Studio plugin: studio-plugin/src/ (isolated plugin runtime)
 *   - Canonical web client: kazakovak2001-lgtm/Frontend (external repository)
 *   - Removed legacy root src/: forbidden to reintroduce
 *
 * Detects:
 *   - Missing canonical backend or Studio roots
 *   - Forbidden source roots
 *   - Backend imports from React or the removed legacy frontend
 *   - Orphan modules
 *   - Deprecated runtime usage
 *
 * Exit: 0 = PASS, 1 = FAIL
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CLEANUP_INVENTORY_PATH = join(
  ROOT,
  "config",
  "cleanup",
  "legacy-frontend-decommission.inventory.json",
);

const FORBIDDEN_PATTERNS = [
  "app/src",
  "lib/src",
  "packages/src",
  "backend/src",
  "api/src",
  "core/src",
];

interface CleanupInventory {
  roadmapId: string;
  status: string;
  canonicalFrontend: {
    repository: string;
    commit: string;
  };
  legacyFrontend: {
    sourceRoot: string;
  };
}

interface Violation {
  type: "missing-root" | "forbidden-root" | "cross-boundary" | "orphan-module";
  path: string;
  severity: "critical" | "warning";
  message: string;
}

function loadCleanupInventory(): CleanupInventory {
  if (!existsSync(CLEANUP_INVENTORY_PATH)) {
    throw new Error(
      "Cleanup inventory is required to resolve the canonical Frontend boundary",
    );
  }

  return JSON.parse(
    readFileSync(CLEANUP_INVENTORY_PATH, "utf8"),
  ) as CleanupInventory;
}

function scanForMissingCanonicalRoots(): Violation[] {
  const violations: Violation[] = [];
  const canonicalRoots = [
    {
      path: "server/src",
      message: "Canonical backend source root is missing",
    },
    {
      path: "studio-plugin/src",
      message: "Canonical Roblox Studio plugin source root is missing",
    },
  ];

  for (const root of canonicalRoots) {
    const absolutePath = join(ROOT, root.path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      violations.push({
        type: "missing-root",
        path: root.path,
        severity: "critical",
        message: root.message,
      });
    }
  }

  return violations;
}

function scanForForbiddenRoots(legacyRoot: string): Violation[] {
  const violations: Violation[] = [];

  const removedLegacyRoot = join(ROOT, legacyRoot);
  if (
    existsSync(removedLegacyRoot) &&
    statSync(removedLegacyRoot).isDirectory()
  ) {
    violations.push({
      type: "forbidden-root",
      path: legacyRoot,
      severity: "critical",
      message: `Removed legacy frontend root reintroduced: ${legacyRoot}/`,
    });
  }

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

  for (const directory of topLevel) {
    if (["src", "server", "studio-plugin"].includes(directory)) continue;
    const potentialSourceRoot = join(ROOT, directory, "src");
    if (
      existsSync(potentialSourceRoot) &&
      statSync(potentialSourceRoot).isDirectory()
    ) {
      violations.push({
        type: "forbidden-root",
        path: `${directory}/src`,
        severity: "critical",
        message: `Unexpected source root: ${directory}/src/`,
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
    if (contents.some((file) => file.endsWith(".ts") || file.endsWith(".js"))) {
      violations.push({
        type: "orphan-module",
        path: "agents/",
        severity: "critical",
        message:
          "Legacy agents/ contains source — canonical agents belong in server/src/agents/",
      });
    }
  }

  return violations;
}

function collectTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectTypeScriptFiles(absolutePath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

function scanForBackendBoundaryViolations(): Violation[] {
  const violations: Violation[] = [];
  const backendFiles = collectTypeScriptFiles(join(ROOT, "server", "src"));

  for (const file of backendFiles) {
    const content = readFileSync(file, "utf8");
    const repositoryPath = relative(ROOT, file).replaceAll("\\", "/");

    if (
      /(?:from\s+|import\s*\()\s*["']react(?:-dom)?(?:\/[^"']*)?["']/.test(
        content,
      )
    ) {
      violations.push({
        type: "cross-boundary",
        path: repositoryPath,
        severity: "critical",
        message: "Backend file imports React runtime",
      });
    }

    if (
      /(?:from\s+|import\s*\()\s*["'](?:\.\.\/)+src(?:\/|["'])/.test(content) ||
      /(?:from\s+|import\s*\()\s*["']@\//.test(content)
    ) {
      violations.push({
        type: "cross-boundary",
        path: repositoryPath,
        severity: "critical",
        message: "Backend file imports from removed legacy root src/",
      });
    }
  }

  return violations;
}

function scanForDeprecatedRuntimeUsage(): Violation[] {
  const violations: Violation[] = [];
  const runtimeDirectories = [
    "routes",
    "projects/services",
    "planning",
    "generation",
    "simulation",
    "economy",
    "world",
    "lifecycle",
    "artifacts",
    "export",
    "compiler",
  ].map((directory) => join(ROOT, "server", "src", directory));

  for (const directory of runtimeDirectories) {
    for (const file of collectTypeScriptFiles(directory)) {
      const content = readFileSync(file, "utf8");
      const repositoryPath = relative(ROOT, file).replaceAll("\\", "/");

      if (content.includes("new AIPipelineIntegrator")) {
        violations.push({
          type: "cross-boundary",
          path: repositoryPath,
          severity: "critical",
          message:
            "DEPRECATED: Runtime instantiation of AIPipelineIntegrator detected. Use PlanExecutor.",
        });
      }

      const runtimeImport = content.match(
        /import\s+\{[^}]*AIPipelineIntegrator[^}]*\}\s+from[^\n]*/,
      );
      if (runtimeImport && !runtimeImport[0].includes("import type")) {
        violations.push({
          type: "cross-boundary",
          path: repositoryPath,
          severity: "warning",
          message:
            "Runtime import of AIPipelineIntegrator — use an import type or remove it.",
        });
      }
    }
  }

  return violations;
}

function main(): void {
  const inventory = loadCleanupInventory();
  const legacyRoot = inventory.legacyFrontend.sourceRoot;
  const backendExists = existsSync(join(ROOT, "server", "src"));
  const studioPluginExists = existsSync(join(ROOT, "studio-plugin", "src"));
  const legacyFrontendExists = existsSync(join(ROOT, legacyRoot));

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Canonical Architecture Validator v4             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const violations: Violation[] = [
    ...scanForMissingCanonicalRoots(),
    ...scanForForbiddenRoots(legacyRoot),
    ...scanForOrphanModules(),
    ...scanForBackendBoundaryViolations(),
    ...scanForDeprecatedRuntimeUsage(),
  ];

  console.log("CANONICAL PRODUCT TOPOLOGY");
  console.log(
    `  Backend (/server/src): ${backendExists ? "ACTIVE" : "MISSING"}`,
  );
  console.log(
    `  Studio plugin (/studio-plugin/src): ${
      studioPluginExists ? "ACTIVE" : "MISSING"
    }`,
  );
  console.log(
    `  Canonical Frontend: ${inventory.canonicalFrontend.repository}@${inventory.canonicalFrontend.commit}`,
  );
  console.log(
    `  Legacy frontend (/${legacyRoot}): ${
      legacyFrontendExists ? "REINTRODUCED" : "REMOVED"
    }`,
  );
  console.log(
    `  Cleanup contract: ${inventory.roadmapId} (${inventory.status})`,
  );
  console.log("");

  if (violations.length === 0) {
    console.log("  Boundary violations: NONE");
    console.log("  CI Gate: ACTIVE");
    console.log("  Runtime Guard: ACTIVE");
    console.log("");
    console.log("  System State: STABLE");
    console.log("  Architecture Model: BACKEND + STANDALONE FRONTEND");
    process.exit(0);
  }

  console.error(`  Boundary violations: ${violations.length}\n`);
  for (const violation of violations) {
    console.error(
      `  [${violation.severity.toUpperCase()}] ${violation.type}: ${
        violation.path
      }`,
    );
    console.error(`    → ${violation.message}\n`);
  }
  console.error("  System State: VIOLATION DETECTED");
  process.exit(1);
}

main();
