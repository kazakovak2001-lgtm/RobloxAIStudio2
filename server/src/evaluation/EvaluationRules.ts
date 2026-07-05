import type { EvaluationIssue } from "./EvaluationResult";

/**
 * EvaluationRules
 *
 * Pure, stateless rule functions.  Each rule inspects an agent output and
 * appends EvaluationIssue objects into the provided array.
 * Rules are composable and reusable across different agent schemas.
 *
 * Scoring model:
 *  - Every "error" issue deducts 20 points from a base of 100.
 *  - Every "warning" issue deducts 5 points.
 *  - "info" issues have no score impact.
 *  - Score is clamped to [0, 100].
 */
export class EvaluationRules {
  // ─── Structural rules ────────────────────────────────────────────────────

  /**
   * Checks that every required top-level key is present.
   */
  static requiredKeys(
    output: Record<string, unknown>,
    keys: string[],
    issues: EvaluationIssue[],
  ): void {
    for (const key of keys) {
      if (!(key in output)) {
        issues.push({
          code: "MISSING_FIELD",
          message: `Required field "${key}" is absent`,
          severity: "error",
          field: key,
        });
      }
    }
  }

  /**
   * Checks that values are not null, undefined, or empty strings.
   */
  static nonEmptyValues(
    output: Record<string, unknown>,
    keys: string[],
    issues: EvaluationIssue[],
  ): void {
    for (const key of keys) {
      const val = output[key];
      if (val === null || val === undefined || val === "") {
        issues.push({
          code: "EMPTY_VALUE",
          message: `Field "${key}" is null, undefined, or empty string`,
          severity: "warning",
          field: key,
        });
      }
    }
  }

  /**
   * Checks that array fields are non-empty.
   */
  static nonEmptyArrays(
    output: Record<string, unknown>,
    keys: string[],
    issues: EvaluationIssue[],
  ): void {
    for (const key of keys) {
      const val = output[key];
      if (!Array.isArray(val)) {
        issues.push({
          code: "INVALID_TYPE",
          message: `Field "${key}" must be an array, got ${typeof val}`,
          severity: "error",
          field: key,
        });
      } else if (val.length === 0) {
        issues.push({
          code: "EMPTY_ARRAY",
          message: `Array field "${key}" is empty`,
          severity: "warning",
          field: key,
        });
      }
    }
  }

  /**
   * Checks that object fields are plain objects (not null/array).
   */
  static objectFields(
    output: Record<string, unknown>,
    keys: string[],
    issues: EvaluationIssue[],
  ): void {
    for (const key of keys) {
      const val = output[key];
      if (val === null || val === undefined) continue; // handled by requiredKeys / nonEmptyValues
      if (typeof val !== "object" || Array.isArray(val)) {
        issues.push({
          code: "INVALID_TYPE",
          message: `Field "${key}" must be an object, got ${Array.isArray(val) ? "array" : typeof val}`,
          severity: "error",
          field: key,
        });
      }
    }
  }

  /**
   * Checks that nested required sub-keys exist inside a parent object field.
   * e.g. nestedKeys(output, "gameplay", ["mechanics", "progression"])
   */
  static nestedKeys(
    output: Record<string, unknown>,
    parentKey: string,
    subKeys: string[],
    issues: EvaluationIssue[],
  ): void {
    const parent = output[parentKey];
    if (
      typeof parent !== "object" ||
      parent === null ||
      Array.isArray(parent)
    ) {
      return; // type error already reported by objectFields
    }
    const parentObj = parent as Record<string, unknown>;
    for (const sub of subKeys) {
      if (!(sub in parentObj)) {
        issues.push({
          code: "MISSING_NESTED_FIELD",
          message: `Field "${parentKey}.${sub}" is absent`,
          severity: "warning",
          field: `${parentKey}.${sub}`,
        });
      }
    }
  }

  /**
   * Validates that a field contains a non-empty string.
   */
  static stringFields(
    output: Record<string, unknown>,
    keys: string[],
    issues: EvaluationIssue[],
  ): void {
    for (const key of keys) {
      const val = output[key];
      if (val === undefined || val === null) continue;
      if (typeof val !== "string") {
        issues.push({
          code: "INVALID_TYPE",
          message: `Field "${key}" must be a string, got ${typeof val}`,
          severity: "warning",
          field: key,
        });
      } else if (val.trim().length === 0) {
        issues.push({
          code: "EMPTY_STRING",
          message: `String field "${key}" is blank`,
          severity: "warning",
          field: key,
        });
      }
    }
  }

  /**
   * Detects internal pipeline failure markers (_failed, _skipped).
   */
  static noFailureMarkers(
    output: Record<string, unknown>,
    issues: EvaluationIssue[],
  ): void {
    if (output._failed === true) {
      issues.push({
        code: "PIPELINE_FAILURE_MARKER",
        message: `Output contains _failed=true: ${String(output._error ?? "unknown")}`,
        severity: "error",
      });
    }
    if (output._skipped === true) {
      issues.push({
        code: "PIPELINE_SKIP_MARKER",
        message: `Output contains _skipped=true: ${String(output._reason ?? "unknown")}`,
        severity: "warning",
      });
    }
  }

  // ─── Scoring helper ──────────────────────────────────────────────────────

  /**
   * Compute a 0–100 quality score from a list of issues.
   */
  static computeScore(issues: EvaluationIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      if (issue.severity === "error") score -= 20;
      else if (issue.severity === "warning") score -= 5;
    }
    return Math.max(0, Math.min(100, score));
  }
}
