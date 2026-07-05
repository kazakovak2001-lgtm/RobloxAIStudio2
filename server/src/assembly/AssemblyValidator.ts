import type {
  ProjectAssembly,
  AssemblyValidationResult,
  AssemblyValidationIssue,
} from "./AssemblyTypes";

/**
 * AssemblyValidator
 *
 * Validates a completed ProjectAssembly for structural integrity.
 * Checks: duplicate services, invalid references, missing scripts,
 * folder consistency, network integrity, configuration completeness.
 *
 * Scoring: 100 base, -15/error, -5/warning.
 */
export class AssemblyValidator {
  validate(assembly: ProjectAssembly): AssemblyValidationResult {
    const issues: AssemblyValidationIssue[] = [];

    // ── Services ──────────────────────────────────────────────────────────
    const serviceSet = new Set(assembly.services);
    if (serviceSet.size !== assembly.services.length) {
      issues.push({
        code: "DUPLICATE_SERVICE",
        section: "Services",
        message: "Duplicate services detected",
        severity: "warning",
      });
    }
    if (!serviceSet.has("ServerScriptService")) {
      issues.push({
        code: "MISSING_SSS",
        section: "Services",
        message: "ServerScriptService not included",
        severity: "error",
      });
    }
    if (!serviceSet.has("ReplicatedStorage")) {
      issues.push({
        code: "MISSING_RS",
        section: "Services",
        message: "ReplicatedStorage not included",
        severity: "error",
      });
    }

    // ── Folders ───────────────────────────────────────────────────────────
    if (assembly.folders.length === 0) {
      issues.push({
        code: "NO_FOLDERS",
        section: "Folders",
        message: "No folders in assembly",
        severity: "error",
      });
    }

    // ── Scripts ───────────────────────────────────────────────────────────
    if (assembly.scripts.length === 0) {
      issues.push({
        code: "NO_SCRIPTS",
        section: "Scripts",
        message: "No server scripts assembled",
        severity: "warning",
      });
    }

    const allScriptPaths = new Set<string>();
    for (const s of [
      ...assembly.scripts,
      ...assembly.modules,
      ...assembly.ui,
    ]) {
      if (allScriptPaths.has(s.path)) {
        issues.push({
          code: "DUPLICATE_PATH",
          section: "Scripts",
          message: `Duplicate path: ${s.path}`,
          severity: "warning",
        });
      }
      allScriptPaths.add(s.path);

      if (!serviceSet.has(s.service)) {
        issues.push({
          code: "INVALID_SERVICE_REF",
          section: "Scripts",
          message: `Script "${s.name}" references unknown service "${s.service}"`,
          severity: "error",
        });
      }
    }

    // ── Network ───────────────────────────────────────────────────────────
    const networkNames = new Set<string>();
    for (const n of assembly.network) {
      if (networkNames.has(n.name)) {
        issues.push({
          code: "DUPLICATE_NETWORK",
          section: "Network",
          message: `Duplicate network object: ${n.name}`,
          severity: "warning",
        });
      }
      networkNames.add(n.name);
    }

    // ── Configuration ─────────────────────────────────────────────────────
    if (assembly.configuration.length === 0) {
      issues.push({
        code: "NO_CONFIG",
        section: "Configuration",
        message: "No configuration values defined",
        severity: "info",
      });
    }

    // ── World ─────────────────────────────────────────────────────────────
    if (assembly.world.length === 0) {
      issues.push({
        code: "EMPTY_WORLD",
        section: "World",
        message: "No workspace entries defined",
        severity: "warning",
      });
    }

    // ── Score ─────────────────────────────────────────────────────────────
    let score = 100;
    for (const issue of issues) {
      if (issue.severity === "error") score -= 15;
      else if (issue.severity === "warning") score -= 5;
    }
    score = Math.max(0, Math.min(100, score));

    const errors = issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message);
    const warnings = issues
      .filter((i) => i.severity === "warning")
      .map((i) => i.message);
    const status: AssemblyValidationResult["status"] =
      errors.length > 0
        ? "failed"
        : warnings.length > 0
          ? "warnings"
          : "passed";

    console.log(
      `[ASSEMBLY] Validation | Score: ${score} | Status: ${status} | Errors: ${errors.length} | Warnings: ${warnings.length}`,
    );

    return { status, score, issues, warnings, errors };
  }
}
