/**
 * Git Pre-Commit Boundary Guard
 *
 * Checks staged files for architecture boundary violations.
 * Runs only on staged files (fast, no full-repo scan).
 * Exit 0 = OK, Exit 1 = BLOCKED
 */

const { execSync } = require("child_process");

const FORBIDDEN_ROOTS = [
  "src/",
  "app/src/",
  "lib/src/",
  "packages/src/",
  "backend/src/",
  "api/src/",
];
const CROSS_BOUNDARY_PATTERNS = [
  {
    zone: "server/src/",
    forbidden: /(?:from\s+|import\s*\()\s*["'](?:@\/|(?:\.\.\/)+src\/)/,
    msg: "Backend imports the removed root frontend",
  },
];

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const files = getStagedFiles();
  if (files.length === 0) process.exit(0);

  const violations = [];

  for (const file of files) {
    // Check forbidden roots
    for (const root of FORBIDDEN_ROOTS) {
      if (file.startsWith(root)) {
        violations.push(`[BLOCKED] File in forbidden root: ${file}`);
      }
    }

    // Check cross-boundary imports (only for .ts/.tsx files)
    if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      for (const rule of CROSS_BOUNDARY_PATTERNS) {
        if (file.startsWith(rule.zone)) {
          try {
            const content = execSync(`git show :${file}`, {
              encoding: "utf-8",
            });
            if (rule.forbidden.test(content)) {
              violations.push(`[BLOCKED] ${rule.msg}: ${file}`);
            }
          } catch {
            /* file might not exist in index */
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("\n❌ Architecture Boundary Violation (pre-commit guard)\n");
    violations.forEach((v) => console.error(`  ${v}`));
    console.error("\nCommit blocked. Fix violations before committing.\n");
    process.exit(1);
  }

  process.exit(0);
}

main();
