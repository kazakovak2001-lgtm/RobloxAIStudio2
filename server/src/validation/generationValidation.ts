/**
 * generationValidation.ts
 *
 * PIPELINE-1B. What deterministic validation found, as a durable artifact.
 *
 * The checks themselves are not new. The playability contract already ran and
 * already refused unplayable Lua; the UI tree builder already knew whether the
 * design could be materialized. What was missing was any durable record of
 * either. The playability contract reported by throwing out of the artifact
 * recorder, so its findings survived only as an exception message, and the UI
 * outcome went to `console.warn` and nowhere else.
 *
 * So `VALIDATION` — a stage that has existed in `StageName` since the pipeline
 * was written — was never produced, and "validation found nothing" was
 * indistinguishable from "validation never ran".
 *
 * This module is pure. It turns outcomes the recorder already has into a typed
 * report; it does not run agents, execute Lua, or read the filesystem.
 */

/** Contract version of the report body. Bump on any shape change. */
export const GENERATION_VALIDATION_SCHEMA_VERSION = 1;

/**
 * How the verdict was reached. A closed set, recorded on the artifact so a
 * later regime cannot be read backwards onto an older report.
 */
export const GENERATION_VALIDATION_ANALYSIS_MODES = [
  "deterministic-contract",
] as const;
export type GenerationValidationAnalysisMode =
  (typeof GENERATION_VALIDATION_ANALYSIS_MODES)[number];

export const GENERATION_VALIDATION_ANALYSIS_MODE: GenerationValidationAnalysisMode =
  "deterministic-contract";

/**
 * What a failing check does.
 *
 * `blocking` is not a new policy. Unplayable Lua already stopped an execution
 * before this slice, and it must keep doing so: there is no game without
 * runnable code. `advisory` records a real signal that has never been allowed
 * to stop anything, and this slice does not promote it.
 */
export type GenerationCheckEnforcement = "blocking" | "advisory";

export type GenerationCheckStatus = "passed" | "failed" | "not-applicable";

export interface GenerationValidationCheck {
  /** Stable identifier. Consumers match on this, not on the title. */
  readonly id: string;
  readonly title: string;
  readonly status: GenerationCheckStatus;
  readonly enforcement: GenerationCheckEnforcement;
  /**
   * Findings behind the status. Deterministic strings from the contract that
   * produced them — never model output, and never a request body.
   */
  readonly details: readonly string[];
}

export interface GenerationValidationReport {
  readonly schemaVersion: number;
  readonly analysisMode: GenerationValidationAnalysisMode;
  readonly checks: readonly GenerationValidationCheck[];
  readonly blockingFailures: number;
  readonly advisoryFailures: number;
  /** True only when no blocking check failed. Advisory failures do not clear. */
  readonly passed: boolean;
  /**
   * What this report does not establish, carried on the record itself so a
   * clean result is never mistaken for a proof of quality.
   */
  readonly limits: readonly string[];
}

/**
 * How the UI stage ended.
 *
 * A discriminated union rather than an optional string: "did not build" and
 * "there was nothing to build" are different facts, and an absent field must
 * never be able to read as success.
 */
export type UIMaterializationOutcome =
  | { readonly status: "built" }
  | { readonly status: "not-attempted" }
  | { readonly status: "failed"; readonly reason: string };

/** Outcomes the recorder observed while storing a generation's artifacts. */
export interface GenerationValidationInput {
  /**
   * Whether the Lua stage produced output at all — not whether that output was
   * accepted. Keeping the two apart is the point: a run that generated
   * unplayable Lua and a run that generated none are different failures, and
   * collapsing them hides which one happened.
   */
  readonly luaPresent: boolean;
  /** Playability issues, or an empty array when the contract was satisfied. */
  readonly luaIssues?: readonly string[];
  readonly ui: UIMaterializationOutcome;
}

const LIMITS: readonly string[] = [
  "No Lua is executed: this is a static contract check, not a runtime result.",
  "No cross-artifact consistency is checked — generated code is not compared against the architecture, UI or asset plans.",
  "No asset referenced by the plan is confirmed to exist.",
  "A passing report means the recorded checks found nothing, not that the game is correct or complete.",
];

/**
 * Build the report from what the recorder observed.
 *
 * Deliberately not wired: `TesterAgent`. It emits a checklist of tests whose
 * status is `pending`, alongside `passed: 0, failed: 0`. Recorded as a
 * validation artifact that reads as zero failures while nothing has run, which
 * is worse than having no artifact at all.
 */
export function buildGenerationValidationReport(
  input: GenerationValidationInput,
): GenerationValidationReport {
  const checks: GenerationValidationCheck[] = [];

  checks.push({
    id: "lua-generated",
    title: "The generation produced Lua to deliver",
    status: input.luaPresent ? "passed" : "failed",
    enforcement: "blocking",
    details: input.luaPresent
      ? []
      : ["No Lua generation stage output was recorded for this execution."],
  });

  const luaIssues = input.luaIssues ?? [];
  checks.push({
    id: "lua-playable",
    title: "Generated Lua satisfies the playability contract",
    status: !input.luaPresent
      ? "not-applicable"
      : luaIssues.length === 0
        ? "passed"
        : "failed",
    enforcement: "blocking",
    // A check that never ran carries no findings. Attaching them would show a
    // consumer results for work that did not happen.
    details: input.luaPresent ? luaIssues : [],
  });

  checks.push({
    id: "ui-materializable",
    title: "UI design builds into a Studio instance tree",
    status:
      input.ui.status === "built"
        ? "passed"
        : input.ui.status === "not-attempted"
          ? "not-applicable"
          : "failed",
    enforcement: "advisory",
    details: input.ui.status === "failed" ? [input.ui.reason] : [],
  });

  const blockingFailures = checks.filter(
    (check) => check.status === "failed" && check.enforcement === "blocking",
  ).length;
  const advisoryFailures = checks.filter(
    (check) => check.status === "failed" && check.enforcement === "advisory",
  ).length;

  return {
    schemaVersion: GENERATION_VALIDATION_SCHEMA_VERSION,
    analysisMode: GENERATION_VALIDATION_ANALYSIS_MODE,
    checks,
    blockingFailures,
    advisoryFailures,
    passed: blockingFailures === 0,
    limits: LIMITS,
  };
}

/**
 * One line naming what blocked the execution, for the durable error message.
 *
 * Kept short and deterministic: the full findings live on the artifact.
 */
export function describeBlockingFailures(
  report: GenerationValidationReport,
): string {
  const failed = report.checks.filter(
    (check) => check.status === "failed" && check.enforcement === "blocking",
  );
  if (failed.length === 0) return "";

  return failed
    .map((check) =>
      check.details.length > 0
        ? `${check.id}: ${check.details.join("; ")}`
        : check.id,
    )
    .join(" | ");
}
