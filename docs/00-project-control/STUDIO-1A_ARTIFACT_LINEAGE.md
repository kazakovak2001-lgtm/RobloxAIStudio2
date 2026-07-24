# STUDIO-1a — Durable Canonical Artifact Lineage

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`

**Status:** Implemented on draft branch; CI validation pending

## Objective

Preserve real outputs from the canonical `PlannerEngine` + `PlanExecutor` pipeline under the durable generation execution ID so the existing Studio v2 snapshot and transfer protocol can retrieve them without placeholder scripts or a parallel artifact system.

## Reuse Audit

The project already contained all required domain boundaries:

- `TaskGraph` retains completed node outputs, agent identity, evaluation, and duration;
- `ArtifactStore` models stage, type, name, content, size, validation, and review state;
- `ProjectSyncManager` builds project snapshots from `ArtifactStore`;
- `ArtifactTransferManager` transfers artifact content with payload-size enforcement;
- CORE-1 provides one configured `StorageProvider` and a real PostgreSQL restart gate.

This slice connects those boundaries. It does not add another generation runtime, artifact model, Studio bridge, transfer manager, or database abstraction.

## Delivered Changes

### Storage-backed ArtifactStore

`ArtifactStore` now accepts an optional explicit `StorageProvider`. When no provider is injected, it lazily resolves the provider configured during application bootstrap. This preserves all existing constructors, including the module-level Studio v2 store created before bootstrap, while ensuring application reads and writes use the same `pipeline_artifacts` collection.

The following operations are durable:

- store;
- get by artifact ID;
- list by execution/pipeline ID;
- mark validated;
- approve, reject, comment, and edit;
- review summary and count.

Without a configured or injected provider, the previous in-memory behavior remains available for isolated tests and compatibility call sites.

### Canonical output recorder

`GenerationArtifactRecorder` maps completed `TaskGraph` nodes to the existing pipeline stage vocabulary:

| Canonical agent | Existing artifact stage |
| --- | --- |
| requirements | REQUIREMENTS |
| planner | REQUEST |
| game_designer | GAME_DESIGN |
| roblox_architect | ARCHITECTURE |
| asset_planner | ASSET_PLANNING |
| lua_generator | LUA_GENERATION |
| ui_generator | UI_GENERATION |
| tester | VALIDATION |
| performance | OPTIMIZATION |
| documentation | DOCUMENTATION |
| orchestrator | EXPORT |

Only nodes with `status === "done"` and a real `output` are stored. Failed, skipped, incomplete, or unmapped tasks do not produce synthetic artifacts.

### Generation integration

`GameGenerationService` retains its existing constructor contract and adds an optional final `ArtifactStore` dependency. The default facade uses the configured application provider. After `PlanExecutor` finishes, each real completed node output is stored under `GenerationExecution.id`, which is also the identifier consumed by `ProjectSyncManager` and artifact transfer.

Artifact persistence occurs before the execution is marked completed. If durable output recording fails, the existing execution failure path records the generation as failed rather than claiming a Studio-ready package that cannot be recovered.

## Validation Coverage

### Native backend test

`studio1.artifact-lineage.test.ts` proves:

- exact canonical agent-to-stage mapping;
- real output preservation without wrapping or placeholder substitution;
- failed and unmapped nodes are skipped;
- ArtifactStore recreation over the same provider restores artifacts;
- review/edit state remains durable;
- the existing `ProjectSyncManager` snapshot contains artifact references;
- the existing `ArtifactTransferManager` returns the original content.

### PostgreSQL restart acceptance

The existing PostgreSQL restart E2E now also:

1. stores a real Lua artifact under a durable execution ID;
2. flushes and closes the first provider;
3. creates and hydrates a new strict PostgreSQL provider;
4. restores the artifact content;
5. builds a Studio snapshot from the reconstructed store.

## Out of Scope

STUDIO-1a does not yet:

- consolidate project-level Studio status/sync with the v2 plugin runtime;
- remove `buildStudioSyncPackage()` or its fallback content;
- prove plugin import or acknowledgement;
- mark frontend `studioArtifactVerified` as true.

Those changes belong to STUDIO-1b and STUDIO-1c after this persistence boundary is green.

## Definition of Done

- TypeScript check passes;
- lint and Prettier pass;
- full backend tests pass;
- repository validation and commitlint pass;
- real PostgreSQL restart acceptance includes artifacts;
- Studio v2 snapshot and transfer consume recovered real outputs;
- no new bridge, store model, transport, or placeholder artifact path is introduced.
