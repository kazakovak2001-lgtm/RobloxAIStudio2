import type { GameDnaReport } from "./gameDna";
import {
  NOVELTY_VERDICT_SCHEMA_VERSION,
  type NoveltyMatch,
  type NoveltyVerdict,
  type NoveltyVerdictRecord,
} from "../types/novelty";

/**
 * NOVELTY-2 — an explicit verdict over the NOVELTY-1 evidence.
 *
 * `NOVELTY-1` measured structure and recorded it durably, and nothing read the
 * result. This turns that evidence into one statement a consumer can act on,
 * and refuses to turn it into a number nobody has measured.
 *
 * **Exact fingerprint equality is the only similarity this slice recognises.**
 * Two generations with the same digest have the same canonical structure, so
 * saying they are the same is a measurement. Anything below that is a tuned
 * threshold, and `NOVELTY-2_PROMOTION_CRITERIA.md` states what has to exist
 * before one may be introduced.
 */

// The durable shape lives in `types/novelty.ts`: `GenerationExecution` carries
// one, and owning it here would make `types` depend on `validation` while
// `validation` already depends on `types`. Re-exported so callers of the
// derivation have one import.
export {
  NOVELTY_VERDICTS,
  NOVELTY_MATCH_RELATIONS,
  NOVELTY_VERDICT_SCHEMA_VERSION,
  type NoveltyVerdict,
  type NoveltyMatch,
  type NoveltyMatchRelation,
  type NoveltyVerdictRecord,
} from "../types/novelty";

function orderMatches(matches: readonly NoveltyMatch[]): NoveltyMatch[] {
  // Deduplicated by execution and ordered code unit by code unit. One
  // execution must not appear twice, and `localeCompare` would order two
  // byte-identical ids differently on hosts with different locales — the
  // defect SECURITY-REVIEW-A2 had to correct.
  const byExecution = new Map<string, NoveltyMatch>();
  for (const match of matches) {
    if (!byExecution.has(match.executionId)) {
      byExecution.set(match.executionId, match);
    }
  }
  return [...byExecution.values()].sort((left, right) =>
    left.executionId < right.executionId
      ? -1
      : left.executionId > right.executionId
        ? 1
        : 0,
  );
}

/**
 * Derive the verdict for one execution.
 *
 * Pure. The caller resolves repair ancestry, because reading lineage is a
 * storage concern and this module is in the validation layer.
 *
 * `ancestors` is the set of execution ids this execution descends from through
 * repair, and `ancestryResolved` says whether that set could be established at
 * all — an empty set means "no ancestors" only when it could.
 */
export function deriveNoveltyVerdict(input: {
  readonly report: GameDnaReport;
  readonly ancestors: ReadonlySet<string>;
  readonly ancestryResolved: boolean;
}): NoveltyVerdictRecord {
  const { report, ancestors } = input;

  const identical = report.comparisons.filter((entry) => entry.identical);
  const duplicateOf = orderMatches(
    identical
      .filter((entry) => !ancestors.has(entry.executionId))
      .map((entry) => ({
        executionId: entry.executionId,
        fingerprint: entry.fingerprint,
        relation: "unrelated" as const,
      })),
  );
  const repairAncestorMatches = orderMatches(
    identical
      .filter((entry) => ancestors.has(entry.executionId))
      .map((entry) => ({
        executionId: entry.executionId,
        fingerprint: entry.fingerprint,
        relation: "repair-ancestor" as const,
      })),
  );

  // Checked before anything else. A comparison that did not happen cannot
  // support `distinct`, and inferring novelty from an empty comparison list is
  // the failure this whole line of work exists to avoid.
  const verdict: NoveltyVerdict =
    report.outcome !== "compared"
      ? "insufficient-history"
      : duplicateOf.length > 0
        ? "duplicate"
        : repairAncestorMatches.length > 0
          ? "repair-preserved"
          : "distinct";

  return {
    schemaVersion: NOVELTY_VERDICT_SCHEMA_VERSION,
    verdict,
    comparisonOutcome: report.outcome,
    fingerprint: report.fingerprint,
    duplicateOf,
    repairAncestorMatches,
    priorsFound: report.priorsFound,
    priorsCompared: report.priorsCompared,
    ancestryResolved: input.ancestryResolved,
  };
}
