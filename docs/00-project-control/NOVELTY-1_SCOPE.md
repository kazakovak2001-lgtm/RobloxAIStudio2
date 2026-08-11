<!-- prettier-ignore-start -->

# NOVELTY-1 — GameDNA and structural similarity fingerprint

**Status:** Scoped. Backend-only; no Roblox Studio evidence is required or claimed.
**Depends on:** `WORLD-1A` (semantic world model), `ARTIFACT-CONTRACT-2` (durable envelope, content identity, lineage). Both complete.
**Complexity:** M. **Risk:** Low — the output is advisory and nothing consumes it to make a decision.

Stage 4 of the [ROADMAP-EXTENSION-1](./ROADMAP-EXTENSION-1_STRATEGIC_DIRECTION.md) sequencing. Stages 1–3 are complete or blocked on the paused Studio evidence.

## Audit findings

Read from the implementations, not assumed.

### There is already a diversity mechanism, and it measures the wrong thing

`server/src/execution/gameDiversityEngine.ts` is live on the real generation path — `GameGenerationService.startGeneration` calls `generateGameDesignSeed` and threads the result into the blueprint and every agent. It is the only importer.

It builds a `GameDesignSeed` by seeding a PRNG from `userId | blueprintId | genre | gameType | executionId` and picking from five hardcoded pools (7 core loops, 15 mechanics, 6 themes, 7 innovation modifiers, 5 constraints). It then compares the candidate against previous seeds with a weighted Jaccard score and retries up to 8 times to stay under `targetMaxSimilarity = 0.6`.

Four things follow, and each is why a fingerprint over generated structure is the actual work:

1. **It compares seeds, not generations.** The similarity measured is over an instruction the platform invented for itself, before any agent ran. Two structurally identical games produced from different seeds read as different; two structurally different games from adjacent seeds read as similar. Nothing anywhere compares what was actually generated.
2. **The history is a process-local `Map`.** `historyByUser` lives in module scope, holds the last 20 seeds per user, and is keyed by user so cross-project and cross-user repetition is invisible. It does not survive a restart — after one, every generation is novel again. It is not registered in `config/runtime/runtime-ownership.json`, so the memory-ownership gate never classified it; the gate reads that registry rather than discovering module state.
3. **The score is never recorded.** `computeSeedSimilarity` is used only inside the retry loop. No execution record, artifact or API response carries it, so no consumer can ask how similar a generation was to anything.
4. **Exhausting the retries is silent.** After 8 attempts the engine returns `fallback` — a seed that failed the similarity target — with no marker distinguishing it from one that passed. This is exactly the "cannot tell checked-and-fine from did-not-check" failure `SECURITY-REVIEW-A2` had to correct.

**This slice does not rewrite that engine.** Seed diversity and output novelty are different questions, and replacing a live generation input is a larger change than measuring output. Finding (4) is the one that misreports, and it is recorded here as carried work rather than fixed quietly.

### The world model is the right substrate, and it does not contain everything the roadmap names

`buildWorldModel({ gameDesign, architecture })` derives a typed structure from the generated design and architecture — not from the request — and the `WORLD_MODEL` artifact already carries an ARTIFACT-CONTRACT-2 content hash and lineage on `GAME_DESIGN` and `ARCHITECTURE`.

It provides: `systems` and `entities` carrying one of seven closed `WorldRole` values, `relationships` over five closed kinds, `constraints` over four closed kinds, and `dependencies` as a `systemId → requires[]` graph.

**The graph is not a graph yet.** `buildWorldModel` has exactly one `dependencies.push` site — every `progress-signal` system requires the single `presentation` system — and one `relationships.push` site, so the dependency graph is always a star into one node and its node count, edge count and degree profile are all a function of `roles["progress-signal"]`. This was found by mutation: a test that reversed the model's arrays could not tell a sorted degree profile from an unsorted one, because for every model this producer emits there is only ever one distinct in-degree. A graph component would have been three fields carrying nothing the role distribution does not already hold, so there is none, and a test pins the star property so the component returns when the model earns it.

The roadmap entry names a fingerprint over "mechanics, system graph, progression and economy structure". Of those four, one is structural today. Mechanics become `interactive-entity` entities, one per named mechanic, and services, API contracts and conditions become systems carrying roles — so the *composition* of a game is real signal. Its *wiring* is not, per the paragraph above.

**Progression and economy are present but are not structure.** `buildWorldModel` emits at most one `progression` system and one `scoring` system, each carrying a free-text title copied from `progression.player_progression_model` and `balance.economyOrScoring`. There is no ordering, tiering, currency, sink or source. Fingerprinting those titles would fingerprint prose — the digest would move when a model reworded a sentence and hold still when it changed the economy.

So they are fingerprinted as **presence**, which is what the model actually knows, and the absence of their internal structure is stated rather than papered over with a component that reads a sentence. `NOVELTY-2` inherits an honest gap instead of a signal that looks like four dimensions and is two.

### Prior generations are durably retrievable, within a project

`ArtifactStore.getByPipeline` reads through the configured `ArtifactStorageProvider` when one is present, so artifacts survive a restart. Every artifact written since `ARTIFACT-CONTRACT-2` carries `projectId`.

Cross-**project** comparison is a different matter: there is no index over projects, and `ArtifactStorageProvider.list` takes a predicate and scans the collection. Comparing every generation to every other generation across the installation is not something this slice can do honestly at that cost.

## Scope

1. **`GameDna`** — a versioned structure derived deterministically from the `WorldModel`: role distribution over systems and entities, the relationship-kind multiset, the constraint-kind distribution, system and entity counts, and presence flags for progression and scoring. Derived, never invented; every component names the field it reads, and a component that would read nothing new is absent rather than present and empty.
2. **A fingerprint** — `sha256` over an explicit canonical encoding of the DNA. The encoding is a readable, sorted, line-based form so that what is inside the fingerprint can be read rather than inferred. Computed locally rather than imported from `pipeline/v2`, keeping the validation layer free of a pipeline dependency, following the `scriptContentHash` precedent in `luaSecurityReview.ts`, with a test pinning the two constructions against each other.
3. **A comparison** — `compareGameDna(a, b)` returning a typed distance with per-component parts. Deterministic, symmetric, and independent of the order of the inputs it reads.
4. **A durable `GAME_DNA` artifact** — a new stage with a `game-dna` deterministic producer and a lineage rule binding it to `WORLD_MODEL`, recorded after that artifact commits.
5. **Cross-generation comparison from durable storage** — prior `GAME_DNA` artifacts for the same project, read through the store rather than from process memory, excluding the current execution.
6. **Four explicit states** — `compared`, `no-prior-generations`, `prior-without-dna`, `comparison-failed`. Absence of a comparison is never reported as novelty. A first generation in a project is not novel; it is uncompared, and a comparison that threw is not a project without history.
7. **Required lineage** — `GAME_DNA` is refused on write unless it declares exactly one `WORLD_MODEL` dependency. The envelope rules only said what an edge *may* point at, so a fingerprint bound to nothing would have passed.

The fingerprint covers the DNA only, never the comparison — otherwise the same structure generated twice would fingerprint differently, which is the one property the whole slice exists to provide.

### What review changed

Six findings, all valid, all fixed before merge:

- **The v2 executor would have persisted a passthrough as a fingerprint.** A null-agent stage falls through to `{ _passthrough: true }`, stored as `gameDna.json` under the `game-dna` producer — a durable claim that a comparison ran. This is the fourth stage to need its own branch, and the comment above the third one already said so. Reported by Codex as P1.
- **The repair path carried the parent's report forward**, so a repaired first run would still say `no-prior-generations` while its own parent sat in the same project. The DNA is now excluded from carry-forward and re-derived from the world model the repair carries unchanged — which, unlike `VALIDATION`, it honestly can be, because the DNA is a pure function of exactly that artifact.
- **A failed comparison reported `no-prior-generations`**, asserting a project has no history rather than admitting the comparison did not run. Now `comparison-failed`.
- **A stored DNA was shape-checked, not decoded.** A malformed record with the right `schemaVersion` produced `NaN` distances, which in a report read as a measurement. `decodeGameDna` now validates every closed distribution, count and flag; an undecodable prior lands in `prior-without-dna`.
- **A re-recorded execution counted twice.** `priorsFound` counts executions and `priorsCompared` counted artifacts, so a re-record made the second exceed the first. One DNA per prior execution now, newest wins.
- **`GAME_DNA` could be stored with no lineage at all**, since the envelope rules only permit edges rather than requiring them.

## Out of scope

- **Any gate.** Nothing blocks, warns or alters a generation on similarity. `NOVELTY-2` is the gate, and it is advisory before blocking for the same reason `SECREVIEW-1` was.
- **Rewriting `gameDiversityEngine`**, including its silent 8-attempt fallback and its restart-volatile history. Recorded above as carried work.
- **Structural progression and economy components**, until the world model represents them as more than a sentence. Presence is fingerprinted; shape is not.
- **A dependency-graph component**, until the world model emits edges between systems rather than a star into `presentation`.
- **Cross-project and cross-user comparison**, which needs an index that does not exist.
- **Similarity over generated Lua source.** Text similarity over code is a different measure with different failure modes; the structural claim is what `WORLD-1A` made checkable.
- Thresholds, tuning, and any notion of "too similar".

## Testing strategy

Determinism and order-independence; symmetry of the comparison; that structurally different worlds fingerprint differently, that renaming every service does not, and that structurally identical ones fingerprint identically; the three comparison states, each reached by a real store state rather than a stub; lineage on `WORLD_MODEL`; that the fingerprint does not move when only the comparison changes; and that a failure to compare cannot present as novelty.

Each verified by mutation, which is not a formality here — the first pass had three tests that could not fail and one component that read nothing, and all four were found this way rather than by review.

## Rollback strategy

Additive. The stage, the artifact and the module are new; no existing artifact, contract or execution field changes shape. Reverting leaves durable rows holding an unread artifact stage.

<!-- prettier-ignore-end -->
