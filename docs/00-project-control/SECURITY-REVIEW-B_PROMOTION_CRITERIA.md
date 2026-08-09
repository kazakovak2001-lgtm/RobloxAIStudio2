<!-- prettier-ignore-start -->

# SECURITY-REVIEW-B — Promotion Criteria for a Blocking Security Gate

**Status:** Not scoped. This record exists so the advisory review shipped in `SECREVIEW-1` has a documented path forward, and so nobody promotes it to a gate informally.
**Depends on:** `SECREVIEW-1` (advisory deterministic Lua security review).

## What ships today, and why it is advisory

`SECREVIEW-1` added `server/src/validation/luaSecurityReview.ts`, a deterministic trust-boundary review of generated Luau, recorded as a durable `SECURITY_REVIEW` artifact beside the Lua it reviews.

It is **advisory**: a finding never negates generation, delivery or release. That is a deliberate decision, not an unfinished one. The reviewer is pattern analysis over source text — not a Luau parser, not dataflow analysis, not a runtime proof — and it has no field data yet. A reviewer that can fail a release on its own false positive is worse than the gap it closes.

Every report states this about itself, in the durable artifact rather than only in a log:

```json
{ "analysisMode": "deterministic-pattern", "enforcement": "advisory" }
```

Those fields exist so a historical report can never be reinterpreted under a later regime. A report written today says it was advisory, permanently, whatever the platform does afterwards.

## Criteria that must all hold before blocking is introduced

Blocking is a separate delivery — `SECURITY-REVIEW-B` — and must not be folded into an unrelated slice. It may begin only when every item below is satisfied and evidenced:

| # | Criterion | Why it gates |
|---|---|---|
| 1 | A sufficient sample of **real** generations has been reviewed | Behaviour on synthetic fixtures says nothing about model output in the field |
| 2 | The **false-positive rate is measured**, not estimated | A gate whose error rate is unknown cannot have its cost weighed against its benefit |
| 3 | **No known high-severity false negative** in the covered patterns | Blocking on rules with known holes trades real availability for illusory assurance |
| 4 | Findings carry a **severity and confidence** or equivalent stable classification | Blocking on an unclassified finding set means blocking on everything |
| 5 | Blocking applies to a **clearly defined high-confidence, high-severity subset** | The blocking set must be enumerable and defensible, not "whatever the reviewer said" |
| 6 | An explicit **override / human approval path** exists | A gate with no escape hatch becomes a reason to disable the gate |
| 7 | The blocking policy has its own **contract tests and release evidence** | The policy is itself a control and must be verifiable like every other one |

## What promotion must not do

- It must not reinterpret existing reports. Records written with `enforcement: "advisory"` were advisory; a new regime applies only to records written under it.
- It must not weaken the false-positive suite. That suite is a first-class requirement of the reviewer, not optional coverage, and it grows rather than shrinks when blocking is introduced.
- It must not remove the regression over the canonical deterministic Lua fallback. If the platform's own shipped game ever fails its own security gate, the gate is wrong until proven otherwise.
- It must not silently change `analysisMode`. Replacing pattern analysis with a parser or dataflow engine is a different analysis and gets a different value, so historical comparisons stay honest.

## Explicitly out of scope for promotion, unless separately scoped

A runtime sandbox, a Luau parser, dynamic taint analysis, an LLM security reviewer, automatic repair of findings, and any redesign of the existing quality scoring. Each is its own delivery with its own evidence; none is a prerequisite for a narrow, well-measured blocking subset.

## Current references

- [Current Project State](./CURRENT_STATE.md)
- [Roadmap Status](./ROADMAP_STATUS.md)
- `server/src/validation/luaSecurityReview.ts` — the reviewer and its stated limits
- `server/src/validation/__tests__/luaSecurityReview.test.ts` — detection and false-positive suites
- `server/src/__tests__/secreview1.advisory-delivery.test.ts` — the advisory contract, end to end

<!-- prettier-ignore-end -->
