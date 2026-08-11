<!-- prettier-ignore-start -->

# NOVELTY-2 promotion criteria

**What this document is for.** `NOVELTY-2` reports an advisory verdict and calls two generations the same only when their structural fingerprints are byte-identical. This states what must be true before that may become a *similarity threshold* — a non-zero distance below which two generations are treated as the same — and before any novelty judgement may block, warn, or trigger regeneration.

**Nothing here is satisfied today.** `NOVELTY-1` merged on August 11, 2026 and no deployment has yet produced a fingerprint distribution, so every criterion below is open.

## Why exact identity needs no criteria and similarity does

Fingerprint equality is an objective property of two canonical encodings. Two generations with the same digest have the same role distribution, the same relationship and constraint kinds, the same system and entity counts and the same declarations. Reporting that is a measurement, not a judgement.

A distance of `0.18` is a different kind of claim. It says two games are similar *enough* to matter, and nothing in this repository has established what "enough" is. Choosing a number now would make the platform assert a finding it has not measured — the defect the platform audit named in `PlaytestEngine`, whose `scoreLua` awards five points because the source contains `pcall`, and the defect `SECURITY-REVIEW-A2` had to correct when a reviewer reported a pass over code it never read.

## Criteria

| # | Criterion | Why it gates |
|---|---|---|
| 1 | A **fingerprint distribution over real generations** has been collected, not over test fixtures | The fixtures in this repository were written to exercise the code. What real prompts produce is an empirical question with an empirical answer |
| 2 | The distribution is **large enough and varied enough to describe**, with the sample size and the spread of prompts recorded | A threshold drawn from a handful of runs of the same prompt describes that prompt, not the platform |
| 3 | **Human judgements of "too similar" exist for a labelled subset**, gathered independently of the distance the platform computed | Without a ground truth the threshold can only be fitted to itself |
| 4 | The **false-positive and false-negative rates** of a candidate threshold are measured against that subset | A threshold whose error rates are unknown cannot have its cost weighed against its benefit |
| 5 | The **components driving a distance are known**, so a finding says which dimension made two games similar | An unexplained score is unactionable, and the current comparison is an unweighted mean chosen precisely because nothing has measured which dimension matters |
| 6 | The **known structural gaps are closed or explicitly accepted** — the world model's star dependency graph and progression and economy existing only as prose | A threshold over a fingerprint that measures composition but not wiring may be measuring the wrong thing, and that must be a stated decision rather than an oversight |
| 7 | If the verdict is to **block**, an explicit override and human-approval path exists | A gate with no escape hatch becomes a reason to disable the gate |
| 8 | The threshold and the blocking policy have their **own contract tests and release evidence** | The policy is itself a control and must be verifiable like every other one |

## What may change without satisfying these

Exact-identity reporting may be extended freely: more evidence on the record, more precise ancestry, surfacing the verdict in more places. None of that introduces a tuned number.

## What may not

A non-zero similarity threshold in any form — configurable, defaulted, "advisory-only", or hidden inside a score — and any behaviour that fails, retries, regenerates or warns on a novelty judgement.

An advisory threshold is not a safe halfway step. A number that appears in a durable record is read as a measurement whether or not anything acts on it, and the first consumer to act on it inherits confidence nobody established.

## Related

- [NOVELTY-2 scope](./NOVELTY-2_SCOPE.md)
- [NOVELTY-1 scope](./NOVELTY-1_SCOPE.md) — what the fingerprint measures and what it deliberately does not
- [SECURITY-REVIEW-B promotion criteria](./SECURITY-REVIEW-B_PROMOTION_CRITERIA.md) — the same pattern for the advisory security reviewer

<!-- prettier-ignore-end -->
