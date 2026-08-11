/**
 * NOVELTY-2 — the durable shape of a novelty verdict.
 *
 * The types live here rather than beside the function that derives them
 * because `GenerationExecution` carries one, and a durable record type owned
 * by the validation layer would make `types` depend on `validation` while
 * `validation` already depends on `types`. The derivation stays in
 * `validation/noveltyVerdict.ts`; only the shape is here.
 */

/**
 * Four states, because three cannot be told truthfully.
 *
 * A repaired execution carries its parent's design forward unchanged, so its
 * fingerprint is legitimately identical. Calling that `duplicate` asserts an
 * unrelated repeat; calling it `distinct` asserts no prior shares the
 * structure, when one does and the reason is known and expected.
 */
export const NOVELTY_VERDICTS = [
  "duplicate",
  "repair-preserved",
  "distinct",
  "insufficient-history",
] as const;
export type NoveltyVerdict = (typeof NOVELTY_VERDICTS)[number];

/** How a prior generation with an identical fingerprint relates to this one. */
export const NOVELTY_MATCH_RELATIONS = [
  "unrelated",
  "repair-ancestor",
] as const;
export type NoveltyMatchRelation = (typeof NOVELTY_MATCH_RELATIONS)[number];

export interface NoveltyMatch {
  readonly executionId: string;
  readonly fingerprint: string;
  readonly relation: NoveltyMatchRelation;
}

export const NOVELTY_VERDICT_SCHEMA_VERSION = 1;

export interface NoveltyVerdictRecord {
  readonly schemaVersion: number;
  readonly verdict: NoveltyVerdict;
  /**
   * The NOVELTY-1 outcome this was derived from, carried rather than
   * collapsed. `insufficient-history` says a comparison did not happen;
   * whether that was an empty project, priors carrying no fingerprint, or a
   * failure are three different facts, and a reader acting on the difference
   * has to be able to see it.
   */
  readonly comparisonOutcome: string;
  /** This execution's own structural fingerprint. */
  readonly fingerprint: string;
  /**
   * Identical priors that are not repair ancestors — the evidence for
   * `duplicate`. Empty for every other verdict.
   */
  readonly duplicateOf: readonly NoveltyMatch[];
  /**
   * Identical priors that are repair ancestors of this execution. Recorded
   * whatever the verdict, because a repaired run resembling its own parent is
   * information rather than a finding.
   */
  readonly repairAncestorMatches: readonly NoveltyMatch[];
  /** Carried from the report so the verdict can be read without it. */
  readonly priorsFound: number;
  readonly priorsCompared: number;
  /**
   * `false` when repair ancestry could not be established for this execution.
   *
   * A repair whose parent predates ARTIFACT-CONTRACT-2 has no lineage edge to
   * walk, so an identical parent is indistinguishable from an unrelated
   * repeat. The verdict is still reported, and this states that it rests on
   * ancestry nobody could confirm rather than on ancestry known to be absent.
   */
  readonly ancestryResolved: boolean;
}
