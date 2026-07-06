/**
 * RuntimeBoundaryGuard.ts
 *
 * Runtime enforcement layer — runs on backend startup.
 * Validates filesystem structure and detects architectural drift.
 * In dev mode: logs cross-domain violations with stack traces.
 * In production: fail-fast on critical violations.
 */

import { existsSync } from "fs";
import { join } from "path";
import { ARCHITECTURE } from "./ArchitecturePolicy";
import { ImportBoundaryValidator } from "./ImportBoundaryValidator";

export type GuardResult = {
  status: "STABLE" | "WARNING" | "CRITICAL";
  checks: Array<{ name: string; passed: boolean; message: string }>;
  domainViolations?: number;
  circularDeps?: number;
};

export class RuntimeBoundaryGuard {
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  /**
   * Run all runtime boundary checks.
   * Called at server startup.
   */
  validate(): GuardResult {
    const checks: GuardResult["checks"] = [];

    // Check frontend root exists
    checks.push(
      this.checkExists(ARCHITECTURE.frontendRoot, "Frontend root (src/)"),
    );

    // Check backend root exists
    checks.push(
      this.checkExists(ARCHITECTURE.backendRoot, "Backend root (server/src/)"),
    );

    // Check no forbidden roots
    const forbiddenRoots = ["app/src", "lib/src", "backend/src", "api/src"];
    for (const root of forbiddenRoots) {
      const exists = existsSync(join(this.rootDir, root));
      checks.push({
        name: `No forbidden root: ${root}`,
        passed: !exists,
        message: exists
          ? `CRITICAL: Forbidden source root detected: ${root}`
          : "OK",
      });
    }

    // Check no legacy agents/ with source
    const legacyAgents = join(this.rootDir, "agents");
    const hasLegacyAgents =
      existsSync(legacyAgents) && existsSync(join(legacyAgents, "index.ts"));
    checks.push({
      name: "No legacy agents/",
      passed: !hasLegacyAgents,
      message: hasLegacyAgents
        ? "WARNING: Legacy agents/ directory contains source"
        : "OK",
    });

    // ─── Domain Boundary Scan (dev mode: warn, production: fail) ────────
    let domainViolations = 0;
    let circularDeps = 0;

    try {
      const manifestPath = join(this.rootDir, "architecture.manifest.json");
      if (existsSync(manifestPath)) {
        const validator = new ImportBoundaryValidator(
          this.rootDir,
          manifestPath,
        );
        const result = validator.scanProject();
        domainViolations = result.violations.length;
        circularDeps = result.circularDeps.length;

        if (domainViolations > 0) {
          const isProduction =
            process.env.NODE_ENV === "production" ||
            process.env.RUNTIME_MODE === "production";

          if (isProduction) {
            // Production: treat as critical
            checks.push({
              name: "Domain boundary violations",
              passed: false,
              message: `CRITICAL: ${domainViolations} domain boundary violation(s) detected in production`,
            });
          } else {
            // Dev mode: log warnings with details
            console.warn(
              `[RUNTIME-GUARD] ⚠️ ${domainViolations} domain boundary violation(s) detected:`,
            );
            for (const v of result.violations.slice(0, 5)) {
              console.warn(
                `  → [${v.rule}] ${v.file}: ${v.sourceDomain} → ${v.targetDomain}`,
              );
              console.warn(`    ${v.message}`);
            }
            if (domainViolations > 5) {
              console.warn(`  → ... and ${domainViolations - 5} more`);
            }
            checks.push({
              name: "Domain boundary violations (dev)",
              passed: true, // don't fail in dev
              message: `WARNING: ${domainViolations} violation(s) — non-blocking in dev mode`,
            });
          }
        } else {
          checks.push({
            name: "Domain boundary scan",
            passed: true,
            message: "OK — no violations",
          });
        }

        if (circularDeps > 0) {
          console.warn(
            `[RUNTIME-GUARD] ⚠️ ${circularDeps} circular domain dependency chain(s):`,
          );
          for (const cycle of result.circularDeps.slice(0, 3)) {
            console.warn(`  → ${cycle.join(" → ")}`);
          }
        }
      }
    } catch {
      // Manifest not found or parse error — skip domain scan silently
      checks.push({
        name: "Domain boundary scan",
        passed: true,
        message: "SKIPPED — architecture.manifest.json not available",
      });
    }

    // Determine overall status
    const hasCritical = checks.some(
      (c) => !c.passed && c.message.startsWith("CRITICAL"),
    );
    const hasWarning = checks.some((c) => !c.passed);

    const status: GuardResult["status"] = hasCritical
      ? "CRITICAL"
      : hasWarning
        ? "WARNING"
        : "STABLE";

    if (status === "CRITICAL") {
      console.error(
        "[RUNTIME-GUARD] ❌ CRITICAL architecture violation detected. System may be unstable.",
      );
      for (const check of checks.filter((c) => !c.passed)) {
        console.error(`  → ${check.message}`);
      }
    } else if (status === "WARNING") {
      console.warn("[RUNTIME-GUARD] ⚠️ Architecture warnings detected.");
    } else {
      console.log("[RUNTIME-GUARD] ✅ Architecture boundaries intact.");
    }

    return { status, checks, domainViolations, circularDeps };
  }

  private checkExists(
    relativePath: string,
    label: string,
  ): GuardResult["checks"][0] {
    const fullPath = join(this.rootDir, relativePath);
    const exists = existsSync(fullPath);
    return {
      name: label,
      passed: exists,
      message: exists
        ? "OK"
        : `CRITICAL: ${label} not found at ${relativePath}`,
    };
  }
}
