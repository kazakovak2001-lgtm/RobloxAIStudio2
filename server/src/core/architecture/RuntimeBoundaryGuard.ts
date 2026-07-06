/**
 * RuntimeBoundaryGuard.ts
 *
 * Runtime enforcement layer — runs on backend startup.
 * Validates filesystem structure and detects architectural drift.
 * Fail-fast on critical violations.
 */

import { existsSync } from "fs";
import { join } from "path";
import { ARCHITECTURE } from "./ArchitecturePolicy";

export type GuardResult = {
  status: "STABLE" | "WARNING" | "CRITICAL";
  checks: Array<{ name: string; passed: boolean; message: string }>;
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

    return { status, checks };
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
