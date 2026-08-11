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
  readonly schemaVersion: number;
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

/**
 * Decode a report read back out of storage.
 *
 * Strict about the version and the evidence kind. A payload carrying neither
 * predates this contract: it is a legacy heuristic record, and returning it as
 * a report would let a number produced by counting `pcall` occurrences be read
 * as a measurement.
 */
export function decodePlaytestReport(stored: unknown): PlaytestReport | null {
  if (typeof stored !== "object" || stored === null) return null;
  const record = stored as Record<string, unknown>;
  if (record.schemaVersion !== PLAYTEST_REPORT_SCHEMA_VERSION) return null;
  if (
    typeof record.evidenceKind !== "string" ||
    !PLAYTEST_EVIDENCE_KINDS.includes(
      record.evidenceKind as PlaytestEvidenceKind,
    )
  ) {
    return null;
  }
  const runtime = record.runtime as RuntimeMeasurement | undefined;
  if (!runtime || runtime.status !== "not-measured") return null;
  if (!Array.isArray(record.issues)) return null;
  return stored as PlaytestReport;
}
