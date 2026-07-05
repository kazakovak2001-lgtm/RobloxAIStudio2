/**
 * EvaluationResult
 *
 * The canonical output of every agent output evaluation.
 * Returned by Evaluator.evaluate() and stored on GenerationExecution.
 */

export type EvaluationStatus = "passed" | "warning" | "failed";

export interface EvaluationIssue {
  /** Short machine-readable code, e.g. "MISSING_FIELD", "EMPTY_ARRAY" */
  code: string;
  /** Human-readable description */
  message: string;
  /** How severe this issue is */
  severity: "error" | "warning" | "info";
  /** Which field path triggered this issue, if applicable */
  field?: string;
}

export interface EvaluationResult {
  /** Agent type key, e.g. "lua_generator" */
  agentType: string;
  /** 0–100 composite quality score */
  qualityScore: number;
  /** Overall evaluation verdict */
  status: EvaluationStatus;
  /** List of detected issues */
  issues: EvaluationIssue[];
  /** Suggested improvements for the next iteration */
  recommendations: string[];
  /** How long the evaluation took in milliseconds */
  durationMs: number;
  /** When this evaluation was run */
  timestamp: Date;
}

/**
 * Minimal in-pipeline summary stored on each pipeline_step.
 * Kept separate from EvaluationResult to avoid bloating the execution record.
 */
export interface StepEvaluationSummary {
  qualityScore: number;
  status: EvaluationStatus;
  issueCount: number;
  durationMs: number;
}
