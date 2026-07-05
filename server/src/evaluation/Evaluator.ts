import type {
  EvaluationIssue,
  EvaluationResult,
  EvaluationStatus,
} from "./EvaluationResult";
import { EvaluationRules } from "./EvaluationRules";

/**
 * AgentEvaluationSpec
 *
 * Declarative schema that drives Evaluator.evaluate().
 * Each agent type registers one of these via EvaluationRegistry.
 */
export interface AgentEvaluationSpec {
  /** Agent type key (matches pipeline stepId) */
  agentType: string;
  /** Top-level keys that must be present */
  requiredKeys: string[];
  /** Top-level keys whose values must be non-empty (after requiredKeys check) */
  nonEmptyKeys?: string[];
  /** Top-level keys that must be arrays (may be empty warning, not error) */
  arrayKeys?: string[];
  /** Top-level keys that must be plain objects */
  objectKeys?: string[];
  /** Top-level string fields that must be non-blank */
  stringKeys?: string[];
  /** Nested field checks: { parentKey: subKeys[] } */
  nestedChecks?: Record<string, string[]>;
  /**
   * Minimum score threshold to pass.
   * Default: 60 (failed below), 80 (warning below)
   */
  thresholds?: {
    /** Score below this → status = "failed". Default: 60 */
    failed: number;
    /** Score below this → status = "warning". Default: 80 */
    warning: number;
  };
  /** Optional recommendations always attached when quality is below 100 */
  recommendations?: string[];
}

/**
 * Evaluator
 *
 * Core evaluation engine. Stateless — all state lives in the spec.
 * Runs the rule set for a given agent spec against an output record,
 * computes a quality score, and returns a structured EvaluationResult.
 */
export class Evaluator {
  /**
   * Evaluate an agent output against its registered spec.
   *
   * @param agentType  Pipeline agent type key
   * @param output     Raw output record from the agent
   * @param spec       Evaluation spec for this agent type
   * @returns          Structured EvaluationResult with score, status, issues
   */
  static evaluate(
    agentType: string,
    output: Record<string, unknown>,
    spec: AgentEvaluationSpec,
  ): EvaluationResult {
    const start = Date.now();
    const issues: EvaluationIssue[] = [];

    // ── Always check for pipeline failure markers first ──────────────────
    EvaluationRules.noFailureMarkers(output, issues);

    // ── Required keys ─────────────────────────────────────────────────────
    EvaluationRules.requiredKeys(output, spec.requiredKeys, issues);

    // ── Non-empty values ─────────────────────────────────────────────────
    if (spec.nonEmptyKeys?.length) {
      EvaluationRules.nonEmptyValues(output, spec.nonEmptyKeys, issues);
    }

    // ── Array fields ──────────────────────────────────────────────────────
    if (spec.arrayKeys?.length) {
      EvaluationRules.nonEmptyArrays(output, spec.arrayKeys, issues);
    }

    // ── Object fields ─────────────────────────────────────────────────────
    if (spec.objectKeys?.length) {
      EvaluationRules.objectFields(output, spec.objectKeys, issues);
    }

    // ── String fields ─────────────────────────────────────────────────────
    if (spec.stringKeys?.length) {
      EvaluationRules.stringFields(output, spec.stringKeys, issues);
    }

    // ── Nested key checks ─────────────────────────────────────────────────
    if (spec.nestedChecks) {
      for (const [parentKey, subKeys] of Object.entries(spec.nestedChecks)) {
        EvaluationRules.nestedKeys(output, parentKey, subKeys, issues);
      }
    }

    // ── Score and status ──────────────────────────────────────────────────
    const qualityScore = EvaluationRules.computeScore(issues);
    const thresholds = spec.thresholds ?? { failed: 60, warning: 80 };
    let status: EvaluationStatus;
    if (qualityScore < thresholds.failed) {
      status = "failed";
    } else if (qualityScore < thresholds.warning) {
      status = "warning";
    } else {
      status = "passed";
    }

    // ── Recommendations ───────────────────────────────────────────────────
    const recommendations: string[] = [];
    if (qualityScore < 100 && spec.recommendations?.length) {
      recommendations.push(...spec.recommendations);
    }
    // Auto-generate recommendations from error issues
    for (const issue of issues) {
      if (issue.severity === "error") {
        recommendations.push(`Fix: ${issue.message}`);
      }
    }

    const durationMs = Date.now() - start;

    // ── Structured log ────────────────────────────────────────────────────
    const warnCount = issues.filter((i) => i.severity === "warning").length;
    const errCount = issues.filter((i) => i.severity === "error").length;
    console.log(
      `[EVALUATION] Agent: ${agentType} | Score: ${qualityScore} | Status: ${status}` +
        ` | Errors: ${errCount} | Warnings: ${warnCount} | Duration: ${durationMs}ms`,
    );

    return {
      agentType,
      qualityScore,
      status,
      issues,
      recommendations,
      durationMs,
      timestamp: new Date(),
    };
  }
}
