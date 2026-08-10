<!-- prettier-ignore-start -->

# ARTIFACT-CONTRACT-2 — Durable Artifact Envelope and Lineage

**Status:** Code complete and contract tested. Backend-only; no Roblox Studio evidence is required or claimed.
**Depends on:** `AGENT-CONTRACT-1` (producer identity), `PIPELINE-1B` (staged commit), `WORLD-1A` (cross-artifact validation).
**Not to be confused with `ARTIFACT-1`,** which gave delivered artifacts a stable *Studio instance* identity. This slice is about the durable *backend* envelope.

## Audit findings

### The artifact shape as found

`PipelineArtifact` carried `id, pipelineId, stage, agent, type, name, createdAt, content, sizeBytes, validated, reviewStatus, reviewComment?, reviewedAt?, reviewedBy?`. `pipelineId` is the **execution** id, not the project.

| Field | Classification |
|---|---|
| `id`, `stage`, `type`, `name`, `createdAt`, `sizeBytes` | **Authoritative and enforced** — `name` is derived from a stage table, never from content |
| `validated`, `reviewStatus`, `reviewedBy`, `reviewedAt` | **Authoritative but not enforced** — `allApproved` exists and nothing consults it before delivery |
| `agent` | **Inferred and untyped** — a real agent id for some stages, `null` for deterministic ones, and invented strings (`repair-engine`, `legacy-package-adapter`) for others |
| `pipelineId` | **Authoritative** for the execution, but says nothing about the project |
| schema version, project, content hash, producer version, dependencies | **Missing** |

### Producers as found

Four, and only one of them was attributed truthfully:

| Producer | What it wrote |
|---|---|
| `GenerationArtifactRecorder` | The generation package. Agent stages carried a real agent id; `VALIDATION`, `SECURITY_REVIEW` and `WORLD_MODEL` carried `agent: null`, so three different deterministic producers were indistinguishable |
| `RepairEngine` | The repaired Lua under `agent: "repair-engine"`, plus every other stage copied forward unchanged |
| `PipelineEngine` (v2, reachable only from `routes/concept.ts`) | Stage output keyed by `stage.agentId`, with no lineage at all — and five of its stages have no agent |
| `StudioIntegrationManager` | A legacy package under `agent: "legacy-package-adapter"`, keyed by package id even though the package carries its own `projectId` |

### The defect this slice exists to close

**A repaired execution carried the parent's `SECURITY_REVIEW` and `VALIDATION` forward unchanged.** New Lua sat beside a security report of the old Lua and a validation report of the old package, under one execution id, with nothing marking either as stale. That is exactly the "Lua v2 + report from Lua v1 as one coherent package" case, and it was live.

### Hashing as found

`ArtifactTransferManager.toRef` computes `sha256(JSON.stringify(content))` truncated to 16 hex characters, at transfer time, for change detection. It is insertion-order sensitive. `ProjectSyncManager.generateVersion` folds those into a project version string. Neither is a durable content identity, and neither was stored.

### Parallel definitions

`server/src/artifacts/GameArtifact.ts` is a **different** concept — the assembled game output used by `/api/v1` and `RobloxProjectCompiler`, not the durable pipeline artifact. It is untouched here; unifying them is unrelated work.

## The envelope

`server/src/pipeline/v2/artifactEnvelope.ts`, pure. Five fields added to `PipelineArtifact`, all optional **on the type only** so historical rows stay readable — the store refuses to write a new artifact missing any of them.

```
schemaVersion   envelope version, not payload version
projectId       owning project, from server-held execution context
contentHash     "sha256:<hex>" over the canonical serialization of content
producer        { type: agent | deterministic | human, id, version }
dependencies    [{ artifactId, stage, contentHash }]
```

### Canonical serialization

`canonicalJson` — object keys sorted at every depth, arrays order-preserving, strings verbatim, `-0` normalised to `0`, `Date` as ISO-8601. `undefined`, functions, symbols, bigints and non-finite numbers are **rejected**, not dropped: `JSON.stringify` erases them silently, which would let two different payloads hash identically.

Keys are sorted because the data model treats objects as unordered and a JSONB round trip does not preserve insertion order. Arrays are not sorted because order is meaning there — a different script order is a different package.

### Hash algorithm

SHA-256 over the canonical serialization, labelled `sha256-canonical-json-v1` and prefixed `sha256:` in the stored value. It is computed **once**, at artifact creation, from the content as given; nothing recomputes it in a loop. The algorithm is pinned by `schemaVersion`, so a future envelope version can change it without silently reinterpreting hashes already written.

`contentHash` is **integrity identity, not authorization, and not a safety claim.** It says what the bytes were. It does not say they are safe, and project authorization remains entirely separate.

### Envelope versioning

`ARTIFACT_ENVELOPE_SCHEMA_VERSION = 1`. A missing version means a historical artifact and is not an error. A malformed or future version **fails closed** — validation stops there rather than interpreting the rest under rules that may not apply. Nothing rewrites historical rows to populate the field.

### Producer identity

Recorded at creation and never re-resolved from the current registry. For agent-produced artifacts the version is looked up from AGENT-CONTRACT-1 and reconciled: an artifact claiming a version the current definition does not have is refused. Deterministic producers are a registry — `generation-validation`, `lua-security-review`, `world-model`, `repair-carry-forward`, `legacy-package-adapter`, `pipeline-stage-passthrough` — so `agent: null` no longer collapses several producers into one. `AGENTLESS_STAGE_PRODUCERS` maps each of the five agentless stages to the producer that actually made it, because attributing all of them to the validation pass would be false for four.

A third producer type, `human`, records content a reviewer replaced by hand. `edit()` moves both the content hash **and** the producer, since edited bytes are the reviewer's and leaving the original producer in place would attribute a person's content to an agent.

A caller may name a deterministic producer by id string rather than importing the envelope module, which keeps `StudioIntegrationManager` from adding a cross-layer edge.

### Dependency semantics

An edge means: **if this upstream content changes, this artifact may no longer describe the same generation state.** Pipeline ordering alone is not that relationship, so `ARTIFACT_DEPENDENCY_RULES` enumerates the real ones and rejects anything else as `impossible-stage-lineage`.

Validation covers duplicate, self-referential, unknown, cross-project, hash-mismatched, stage-misnamed and rejected-upstream dependencies, plus malformed and unknown producers. An edge to a pre-envelope artifact is refused outright: it has no durable identity, so nothing can claim an exact binding to it. Issues are raised **on write**, so a lineage edge that does not hold is never persisted — a broken edge reads as verified provenance, which is worse than no edge.

Lineage is resolved during the commit loop, never while staging, so an edge can only name an artifact that is already durably accepted. On the rejected path the `VALIDATION` report is written with **no** dependencies, because nothing was committed for it to point at.

## Repair lineage

The parent execution is never mutated. The repaired Lua is a new artifact with a dependency edge to the Lua it replaces, and its producer is `lua_generator` — the agent that regenerated it — because what makes it a repair is the lineage edge, not a renamed producer.

`SECURITY_REVIEW` is **not** copied forward. It is re-derived from the repaired scripts by the same pure function the generation path uses. `VALIDATION` is neither copied nor re-derived: rebuilding it needs the UI materialization outcome and world cross-validation from the generation run, which a repair does not re-run, so emitting one would state checks that did not happen. Absence is the truthful shape.

Carried-forward stages are attributed to `repair-carry-forward`, not to the agent that originally authored them — that agent did not run during this repair.

## Backward compatibility

Historical artifacts have no envelope, and `validateArtifactEnvelope` returns no issues for them: they make no claims, so there is nothing to contradict. Nothing infers a current schema version, project, hash or producer for them, and nothing may bind to one — `dependencyOn` refuses an artifact with no content hash. They remain readable, transferable and deliverable exactly as before.

New artifacts must use the new envelope. `store()` takes a required write context and throws when the project or producer cannot be established, so a code path that would write a legacy shape fails in development rather than persisting one.

## Persistence

`kv_store.data` is **JSONB** and the whole artifact serializes into it, so **no database migration is required**. The new fields are additive keys inside an existing JSONB column.

JSONB does not preserve key order, which is precisely why the hash is canonical: a round trip that reorders `content` still recomputes to the recorded hash. Verified against both the in-memory store and a reserializing provider, including a store recreated after the write.

## Studio delivery

Unchanged. The transfer fingerprint in `ArtifactRef.hash` is a **different construction** from `contentHash` — 16 hex characters over `JSON.stringify` at transfer time, for change detection — and the two are documented as distinct rather than conflated. The plugin is not authoritative for backend artifact identity and gains no new authority here.

## Known limitations

- `reviewStatus`/`allApproved` remain **unenforced before delivery**; this slice records dependencies on rejected artifacts as an error but does not add a human-review gate.
- Dependency validation resolves upstream artifacts through the store, so an edge to an artifact in a different store instance reports `unknown-dependency`.
- `contentHash` is not indexed and there is no content-addressed lookup; identity is per artifact, not global.
- The v2 `PipelineEngine` path is reachable only from `routes/concept.ts` and is brought into the envelope without being otherwise revisited.

## Out of scope

`WORLD-1C`, conditional branching, dynamic orchestration, new agents, agent substitution, `SECURITY-REVIEW-B` promotion, the canonical-HUD flip, content-addressed global storage, cross-project deduplication, distributed object storage, event sourcing, persistence redesign, provider/model routing, cost optimisation, and unifying `GameArtifact` with `PipelineArtifact`.

<!-- prettier-ignore-end -->
