import type { GameBlueprint } from "./GenerationBlueprint";
import type {
  BlueprintValidationResult,
  ValidationIssue,
} from "./GenerationTypes";

/**
 * BlueprintValidator
 *
 * Validates a finalized GameBlueprint for completeness, consistency,
 * and cross-section integrity. Returns a structured validation result
 * with a 0–100 score.
 *
 * Scoring: base 100, -15 per error, -5 per warning.
 */
export class BlueprintValidator {
  validate(blueprint: GameBlueprint): BlueprintValidationResult {
    const issues: ValidationIssue[] = [];
    const sectionsPresent: string[] = [];
    const sectionsMissing: string[] = [];

    // ── Required sections ─────────────────────────────────────────────────
    const requiredSections: Array<{ key: keyof GameBlueprint; label: string }> =
      [
        { key: "project", label: "Project Info" },
        { key: "requirements", label: "Requirements" },
        { key: "gameplay", label: "Gameplay" },
        { key: "architecture", label: "Architecture" },
        { key: "scripts", label: "Scripts" },
        { key: "ui", label: "UI" },
        { key: "world", label: "World" },
      ];

    for (const { key, label } of requiredSections) {
      if (blueprint[key] !== undefined && blueprint[key] !== null) {
        sectionsPresent.push(label);
      } else {
        sectionsMissing.push(label);
        issues.push({
          code: "MISSING_SECTION",
          section: label,
          message: `Section "${label}" is missing`,
          severity: "error",
        });
      }
    }

    // ── Gameplay section checks ───────────────────────────────────────────
    if (blueprint.gameplay) {
      if (!blueprint.gameplay.coreLoop) {
        issues.push({
          code: "MISSING_CORE_LOOP",
          section: "Gameplay",
          message: "Core gameplay loop not defined",
          severity: "warning",
        });
      }
      if (
        !blueprint.gameplay.mechanics ||
        blueprint.gameplay.mechanics.length === 0
      ) {
        issues.push({
          code: "NO_MECHANICS",
          section: "Gameplay",
          message: "No gameplay mechanics defined",
          severity: "warning",
        });
      }
    }

    // ── Architecture section checks ───────────────────────────────────────
    if (blueprint.architecture) {
      if (
        !blueprint.architecture.services ||
        Object.keys(blueprint.architecture.services).length === 0
      ) {
        issues.push({
          code: "NO_SERVICES",
          section: "Architecture",
          message: "No server services defined",
          severity: "warning",
        });
      }
    }

    // ── Scripts section checks ────────────────────────────────────────────
    if (blueprint.scripts) {
      const serverScripts = blueprint.scripts.server ?? [];
      const clientScripts = blueprint.scripts.client ?? [];
      if (serverScripts.length === 0 && clientScripts.length === 0) {
        issues.push({
          code: "NO_SCRIPTS",
          section: "Scripts",
          message: "No server or client scripts generated",
          severity: "warning",
        });
      }
    }

    // ── UI section checks ─────────────────────────────────────────────────
    if (blueprint.ui) {
      if (!blueprint.ui.screens || blueprint.ui.screens.length === 0) {
        issues.push({
          code: "NO_SCREENS",
          section: "UI",
          message: "No UI screens defined",
          severity: "warning",
        });
      }
    }

    // ── World section checks ──────────────────────────────────────────────
    if (blueprint.world) {
      if (!blueprint.world.name) {
        issues.push({
          code: "NO_WORLD_NAME",
          section: "World",
          message: "World has no name",
          severity: "warning",
        });
      }
    }

    // ── Cross-agent consistency ───────────────────────────────────────────
    if (blueprint.gameplay?.mechanics && blueprint.scripts?.server) {
      // Each mechanic should ideally have a corresponding server script
      const mechanicNames = blueprint.gameplay.mechanics.map((m) =>
        m.name.toLowerCase(),
      );
      const scriptNames = blueprint.scripts.server.map((s) =>
        s.name.toLowerCase(),
      );
      const unimplemented = mechanicNames.filter(
        (m) => !scriptNames.some((s) => s.includes(m.split(" ")[0])),
      );
      if (unimplemented.length > 0 && mechanicNames.length > 2) {
        issues.push({
          code: "UNIMPLEMENTED_MECHANICS",
          section: "Consistency",
          message: `${unimplemented.length} mechanics may not have corresponding scripts`,
          severity: "info",
        });
      }
    }

    // ── Evaluation completeness ───────────────────────────────────────────
    if (blueprint.evaluation) {
      if (blueprint.evaluation.lastStatus === "failed") {
        issues.push({
          code: "EVAL_FAILED",
          section: "Evaluation",
          message: "Last evaluation status is 'failed'",
          severity: "warning",
        });
      }
    }

    // ── Planning consistency ──────────────────────────────────────────────
    if (blueprint.planning?.replanCount && blueprint.planning.replanCount > 2) {
      issues.push({
        code: "MANY_REPLANS",
        section: "Planning",
        message: `Pipeline was replanned ${blueprint.planning.replanCount} times`,
        severity: "info",
      });
    }

    // ── Score calculation ─────────────────────────────────────────────────
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

    const status: BlueprintValidationResult["status"] =
      errors.length > 0
        ? "failed"
        : warnings.length > 0
          ? "warnings"
          : "passed";

    console.log(
      `[GENERATION] Blueprint Validation | Score: ${score} | Warnings: ${warnings.length} | Errors: ${errors.length}`,
    );

    return {
      status,
      score,
      issues,
      warnings,
      errors,
      sectionsPresent,
      sectionsMissing,
    };
  }
}
