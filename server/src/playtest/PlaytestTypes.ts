/**
 * Playtest Types — deterministic static analysis of a generated experience.
 *
 * PLAYTEST-TRUTH-1. This module used to average six numbers into an
 * `overallScore` and call the result `production_ready` above eighty. One of
 * those six was produced by adding five points when any script contained the
 * substring `pcall` and five more for a block comment; it read no findings at
 * all. Nothing here has ever run a Roblox play session, observed a player, or
 * measured anything at runtime.
 *
 * The findings are real and are kept. The arithmetic on top of them is gone,
 * and runtime quality is reported as what it is: not measured.
 */

/** Bumped when the report shape changes. A payload on another version is refused. */
export const PLAYTEST_REPORT_SCHEMA_VERSION = 2;

/**
 * What produced a report.
 *
 * A closed set with one member today, and that is the point: naming it forces
 * a future runtime capability to declare itself rather than inheriting the
 * credibility of a field that never distinguished the two. `PLAYTEST-2` is
 * where a second member would come from.
 */
export const PLAYTEST_EVIDENCE_KINDS = ["static-analysis"] as const;
export type PlaytestEvidenceKind = (typeof PLAYTEST_EVIDENCE_KINDS)[number];

export type IssueSeverity =
  "critical" | "warning" | "suggestion" | "optimization";

export interface PlaytestIssue {
  id: string;
  severity: IssueSeverity;
  category: string;
  affectedArtifact: string;
  reason: string;
  recommendedFix: string;
  priority: number;
}

/**
 * How many findings of each severity a report holds.
 *
 * Counts, not a score. Two criticals are two criticals; what that is worth is
 * a judgement nothing here has grounds to make.
 */
export interface FindingCounts {
  readonly critical: number;
  readonly warning: number;
  readonly suggestion: number;
  readonly optimization: number;
  readonly total: number;
}

/**
 * One category's findings.
 *
 * `status` restates the counts and nothing more: `fail` when a critical
 * finding exists, `warn` when a warning does, otherwise `pass`. It is not a
 * threshold over a magnitude, and it says nothing about whether the game is
 * good.
 */
export interface SystemFindings {
  readonly system: string;
  readonly counts: FindingCounts;
  readonly status: "pass" | "warn" | "fail";
}

export interface PerformanceEstimate {
  scriptCount: number;
  assetCount: number;
  dependencyDepth: number;
  remoteEventCount: number;
  /** An estimate derived from counts. Nothing was timed. */
  estimatedInitTimeMs: number;
  riskAreas: string[];
}

/**
 * Runtime quality, which this platform does not measure.
 *
 * Present and explicit rather than absent, because an absent field reads as an
 * oversight and a zero reads as a failing grade. Neither is true: the question
 * was never asked.
 */
export interface RuntimeMeasurement {
  readonly status: "not-measured";
  readonly reason: string;
}

export const RUNTIME_NOT_MEASURED: RuntimeMeasurement = {
  status: "not-measured",
  reason:
    "No Roblox runtime play session was performed. This report is deterministic static analysis of generated source and asset plans; it observes no gameplay, no player and no runtime behaviour.",
};

export interface PlaytestReport {
  /**
   * Exactly the current version. Typed as the literal so an unsupported
   * version is refused at compile time and not only by the decoder.
   */
  readonly schemaVersion: typeof PLAYTEST_REPORT_SCHEMA_VERSION;
  /** What produced this. Never inferred by a consumer. */
  readonly evidenceKind: PlaytestEvidenceKind;
  projectId: string;
  generatedAt: number;
  /** Always `not-measured` today. See `PLAYTEST-2`. */
  readonly runtime: RuntimeMeasurement;
  readonly findingCounts: FindingCounts;
  issues: PlaytestIssue[];
  readonly systems: SystemFindings[];
  performance: PerformanceEstimate;
  recommendations: PlaytestIssue[];
  /** States what was found. Never how good the game is. */
  summary: string;
}

export interface PlaytestInput {
  projectId: string;
  scripts: Array<{
    name: string;
    type: string;
    path: string;
    content: string;
    dependencies: string[];
  }>;
  assets: Array<{
    name: string;
    type: string;
    targetService: string;
    placeholder: boolean;
  }>;
  dependencyGraph?: {
    nodes: string[];
    edges: Array<{ from: string; to: string }>;
    circular: string[][];
  };
}

/** Count findings by severity. */
export function countFindings(issues: readonly PlaytestIssue[]): FindingCounts {
  const counts = {
    critical: 0,
    warning: 0,
    suggestion: 0,
    optimization: 0,
    total: issues.length,
  };
  for (const issue of issues) {
    if (issue.severity in counts) counts[issue.severity] += 1;
  }
  return counts;
}

/**
 * Findings a repair could act on.
 *
 * Criticals and warnings. Suggestions and optimizations are advice, and
 * treating advice as work to be done is how a repair loop keeps running with
 * nothing left to fix.
 */
export function actionableFindingCount(counts: FindingCounts): number {
  return counts.critical + counts.warning;
}

const ISSUE_SEVERITIES: readonly string[] = [
  "critical",
  "warning",
  "suggestion",
  "optimization",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Counts are whole and cannot be negative; anything else is a corrupt row. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFindingCounts(value: unknown): value is FindingCounts {
  return (
    isRecord(value) &&
    isCount(value.critical) &&
    isCount(value.warning) &&
    isCount(value.suggestion) &&
    isCount(value.optimization) &&
    isCount(value.total)
  );
}

function isPlaytestIssue(value: unknown): value is PlaytestIssue {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.severity === "string" &&
    ISSUE_SEVERITIES.includes(value.severity) &&
    typeof value.category === "string" &&
    typeof value.affectedArtifact === "string" &&
    typeof value.reason === "string" &&
    typeof value.recommendedFix === "string" &&
    isFiniteNumber(value.priority)
  );
}

function isSystemFindings(value: unknown): value is SystemFindings {
  return (
    isRecord(value) &&
    typeof value.system === "string" &&
    isFindingCounts(value.counts) &&
    (value.status === "pass" ||
      value.status === "warn" ||
      value.status === "fail")
  );
}

function isPerformanceEstimate(value: unknown): value is PerformanceEstimate {
  return (
    isRecord(value) &&
    isCount(value.scriptCount) &&
    isCount(value.assetCount) &&
    isCount(value.dependencyDepth) &&
    isCount(value.remoteEventCount) &&
    isFiniteNumber(value.estimatedInitTimeMs) &&
    Array.isArray(value.riskAreas) &&
    value.riskAreas.every((area) => typeof area === "string")
  );
}

/**
 * The evidence contract itself: runtime is present, explicitly not measured,
 * and says why. An empty reason would leave the strongest claim in the report
 * unsupported, so it is refused rather than defaulted.
 */
function isRuntimeMeasurement(value: unknown): value is RuntimeMeasurement {
  return (
    isRecord(value) &&
    value.status === "not-measured" &&
    typeof value.reason === "string" &&
    value.reason.length > 0
  );
}

function isIssueList(value: unknown): value is PlaytestIssue[] {
  return Array.isArray(value) && value.every(isPlaytestIssue);
}

/**
 * Decode a report read back out of storage.
 *
 * Strict about the version and the evidence kind. A payload carrying neither
 * predates this contract: it is a legacy heuristic record, and returning it as
 * a report would let a number produced by counting `pcall` occurrences be read
 * as a measurement.
 *
 * Strict about the rest of the shape for a different reason. This takes
 * `unknown` because it reads storage, where a row can be truncated or
 * half-written. Checking only the version, the evidence kind and the presence
 * of an `issues` array let such a row through as a whole `PlaytestReport`, and
 * the first ordinary access — `report.findingCounts.total` — threw at the
 * caller instead. Every required field is validated before the value is
 * returned, so a report that decodes is a report that can be used.
 *
 * Relaxing any of this to admit an older or partial payload would hand back
 * exactly the unearned credibility this slice removed, so an incomplete row is
 * refused rather than completed with defaults. `total` is deliberately not
 * required to equal the sum of the four severities: `countFindings` sets it
 * from the issue count, and an issue with an unrecognised severity is counted
 * in the total without matching a bucket.
 */
export function decodePlaytestReport(stored: unknown): PlaytestReport | null {
  if (!isRecord(stored)) return null;
  if (stored.schemaVersion !== PLAYTEST_REPORT_SCHEMA_VERSION) return null;
  if (
    typeof stored.evidenceKind !== "string" ||
    !PLAYTEST_EVIDENCE_KINDS.includes(
      stored.evidenceKind as PlaytestEvidenceKind,
    )
  ) {
    return null;
  }
  if (!isRuntimeMeasurement(stored.runtime)) return null;
  if (typeof stored.projectId !== "string") return null;
  if (!isFiniteNumber(stored.generatedAt)) return null;
  if (typeof stored.summary !== "string") return null;
  if (!isFindingCounts(stored.findingCounts)) return null;
  if (!isIssueList(stored.issues)) return null;
  if (!isIssueList(stored.recommendations)) return null;
  if (!Array.isArray(stored.systems) || !stored.systems.every(isSystemFindings))
    return null;
  if (!isPerformanceEstimate(stored.performance)) return null;
  return stored as unknown as PlaytestReport;
}
