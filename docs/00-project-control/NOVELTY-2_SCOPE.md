<!-- prettier-ignore-start -->

# NOVELTY-2 — cross-generation novelty verdict

**Status:** ✅ Complete — backend PR #225. Backend-only; no Roblox Studio evidence is required or claimed.
**Depends on:** `NOVELTY-1` (structural fingerprint and durable comparison). Complete, backend PR #223.
**Complexity:** M. **Risk:** Low — the verdict is advisory and nothing consumes it to make a decision.

Stage four of the [ROADMAP-EXTENSION-1](./ROADMAP-EXTENSION-1_STRATEGIC_DIRECTION.md) sequencing, completing the originality foundation `NOVELTY-1` began.

## Audit findings

Read from the implementations at `d00fefba1442eee05ede5bdf654292aff6a6ea93`, not assumed.

### The fingerprint has no consumer

`NOVELTY-1` writes a `GAME_DNA` report carrying a fingerprint, an outcome, prior counts and per-prior distances. Nothing reads it. Grep for `GAME_DNA` outside its own producers returns the executor branch, the repair path, the recorder and the constants — no route, no service, no execution field, no read model. It reaches Roblox Studio as an inert `StringValue` like every other non-Lua artifact.

So the evidence exists and no consumer can answer the question it was gathered for. That is what this slice closes, and it is why the slice is small: the measurement is already there.

### Exact identity is the only judgement available without invented numbers

The `GAME_DNA` report already records `identical: fingerprint === prior.fingerprint`. Fingerprint equality is an objective fact about two canonical encodings.

**Everything below exact identity is a tuned number and nothing has been measured.** `NOVELTY-1` merged today, so no deployment has produced a fingerprint distribution to calibrate against. A similarity threshold chosen now would be exactly the defect the platform audit named in `PlaytestEngine`, whose `scoreLua` adds five points because the source contains `pcall`. The promotion criteria in [NOVELTY-2_PROMOTION_CRITERIA.md](./NOVELTY-2_PROMOTION_CRITERIA.md) state what must exist before any non-zero threshold may be introduced.

### Repair ancestry is derivable from lineage, and only since ARTIFACT-CONTRACT-2

A repaired execution carries its parent's design forward unchanged, so its DNA is *legitimately* identical to its parent's — the `NOVELTY-1` tests assert exactly that. Classifying it as a duplicate of an unrelated generation would be false.

Ancestry must not be inferred from the execution id. `RepairEngine` names the child `${parentExecutionId}-repair-${n}`, and parsing that string would be exactly the "guess from ordering" this slice must avoid; a renamed convention would silently break it.

The durable signal is a lineage edge. `ARTIFACT_DEPENDENCY_RULES.LUA_GENERATION` permits `LUA_GENERATION` as an upstream stage, and `GenerationArtifactRecorder` never sets `dependsOn` for that stage — checked, it passes none — so **a `LUA_GENERATION` artifact whose dependency names a `LUA_GENERATION` artifact in a different execution exists only on the repair path.** Walking that edge transitively gives the ancestor chain, including a repair of a repair.

**It is not always present.** `RepairEngine` records the edge only when the parent's Lua carries a `contentHash`, which artifacts written before `ARTIFACT-CONTRACT-2` do not. A repair whose parent predates that contract therefore has no retrievable ancestry and is indistinguishable from an unrelated repeat. Recorded as a known limitation below rather than patched by inference.

### The execution record and its read API are already additive-friendly

`GenerationExecution` gained optional fields twice before — `ai_mode`/`ai_provider`/`ai_model` in `PROVIDER-1A`, `pipeline_definition`/`pipeline_version` in `PIPELINE-1A` — each read back as `undefined` on older rows. `GET /:projectId/generation/:executionId/status` returns the execution object whole, so a new optional field reaches the Frontend without a route change. `kv_store.data` is JSONB, so no migration is required.

## The verdict contract

Four states, not three. Three cannot be told truthfully:

| Verdict | Meaning |
|---|---|
| `duplicate` | At least one prior generation **that is not a repair ancestor of this one** has an identical fingerprint |
| `repair-preserved` | Identical priors exist and **every one is a repair ancestor** of this execution — the structure was carried forward by a repair, which is what repair does |
| `distinct` | Priors were compared and no prior shares this fingerprint |
| `insufficient-history` | No comparison was possible |

`repair-preserved` exists because with three states one of the other two has to lie. Calling a repaired execution `duplicate` asserts an unrelated repeat; calling it `distinct` asserts no prior shares its structure, when one does and the reason is known and legitimate.

**The underlying `NOVELTY-1` outcome is carried on the record, never collapsed into the verdict.** `insufficient-history` is a verdict; *why* there was insufficient history stays `no-prior-generations`, `prior-without-dna` or `comparison-failed`, because those mean different things and a reader acting on the difference must be able to see it.

## Scope

1. A `NoveltyVerdictRecord` derived by a pure function from the `GAME_DNA` report plus the resolved repair ancestry.
2. Repair ancestry resolved by walking `LUA_GENERATION` lineage edges across executions, with a cycle guard, never from the execution id.
3. Duplicate evidence naming the exact prior execution ids and fingerprints that support the verdict, deterministically ordered and deduplicated.
4. The record surfaced on `GenerationExecution` as one optional additive field, and therefore through the existing status endpoint unchanged.
5. The same record on `RepairIterationRecord`, because a repaired execution has no `GenerationExecution` row and would otherwise have no verdict at all.
6. `NOVELTY-2_PROMOTION_CRITERIA.md`, stating what evidence must exist before any non-zero similarity threshold or blocking gate may be introduced.

## Out of scope

- **Any similarity threshold other than exact identity**, and any blocking of generation, delivery or release.
- Automatic regeneration on a duplicate verdict.
- Cross-project similarity, which needs an index that does not exist.
- Frontend UI. The field is surfaced; presenting it is that repository's work.
- Rewriting `gameDiversityEngine`, including its restart-volatile history and its silent eight-attempt fallback — still carried from `NOVELTY-1`.
- `NOVELTY-3` or any later roadmap item.

### What review changed

Two findings, both real.

**`repair-preserved` was unreachable in production.** `RepairEngine` writes artifacts and a `RepairIterationRecord` and never touches `GenerationExecution`, so the only production caller of the derivation was the generation path — where an execution has no repair ancestors by construction. The verdict existed in code and nothing could ever produce it. The repair path now derives and records its own verdict on the session record, which is the durable surface a repaired execution actually has.

**Ancestry read only the first Lua artifact.** `ArtifactStore` permits several `LUA_GENERATION` artifacts under one pipeline id — a re-record produces exactly that — so an edge written by a later artifact was invisible and the repaired run would have been reported as an unrelated duplicate. Every Lua artifact is now scanned, newest first, the same policy the DNA comparison uses for a re-recorded prior.

## Known limitations

- A repair whose parent predates `ARTIFACT-CONTRACT-2` has no lineage edge, so its ancestry is unretrievable and an identical fingerprint reads as `duplicate`. The alternative — trusting the `-repair-` id convention — would be the guess this slice exists to avoid.
- Ancestry is read from artifact lineage only. `RepairSessionStore` also records `parentExecutionId`, which would cover the case above, but it belongs to the repair subsystem and is not reachable from the generation path without a new dependency. Named here as the obvious next source, not wired.
- The verdict is computed once at execution commit. It is not recomputed when later generations arrive, so an execution that was `distinct` when recorded stays `distinct` even after an identical one appears. The `GAME_DNA` artifacts remain the queryable record for anything needing a current answer.
- Nothing consumes the verdict to make a decision. That is deliberate for this slice and is the whole content of the promotion criteria.

## Testing strategy

First observable generation; exact unrelated duplicate; structurally distinct; a legacy prior carrying no DNA; history unretrievable under the ownership contract; malformed prior DNA; comparison failure; a repaired execution identical to its parent; a repaired execution with an unrelated identical prior as well; several duplicates with deterministic evidence ordering; durable retrieval across a restart; and an execution record with no verdict at all reading back unchanged. Each verified by mutation.

### One equivalent mutant, recorded rather than papered over

Swapping the identity test from fingerprint equality to `distance === 0` survives every test, and it survives correctly: each DNA field appears in both the canonical encoding and the comparison, so the two conditions coincide today. They stop coinciding the moment a field is added to one and not the other, and fingerprint equality is the side that stays correct because it is defined over the whole encoding. The definition is pinned by a test; the equivalence is recorded here rather than covered by a test that could not fail.

## Rollback strategy

Additive. One optional execution field, one new module, one new document. Reverting leaves durable rows holding an unread key.

<!-- prettier-ignore-end -->
