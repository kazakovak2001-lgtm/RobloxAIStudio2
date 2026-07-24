# STUDIO-1 — Generated Artifact Delivery Audit

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`

**Status:** Audit complete; artifact-lineage implementation active

## Objective

Prove that real outputs from the canonical `PlanExecutor` can be attributed to a durable generation execution, exposed through the existing Studio v2 protocol, transferred to the connected Roblox Studio plugin, and acknowledged without substituting placeholder scripts or creating a third bridge.

## Existing Systems Reused

### Canonical generation runtime

`GameGenerationService.startGeneration()` creates a durable execution and runs the existing `PlannerEngine` + `PlanExecutor`. Each completed `TaskGraph` node already retains its agent output, evaluation, and duration.

### Existing artifact boundary

`pipeline/v2/ArtifactStore` already models pipeline artifacts by pipeline ID, stage, agent, type, content, size, validation state, and review state. `ProjectSyncManager` and `ArtifactTransferManager` already build Studio snapshots and transfer artifact content from this store.

### Existing Studio v2 protocol

`/api/studio/*` already supports plugin registration, heartbeat, `GET_PROJECT`, `GET_ARTIFACTS`, sync validation, snapshots, and artifact transfer.

## Proven Gaps

1. **PlanExecutor outputs are not stored.** `GameGenerationService` persists only execution status and step metadata; `result.outputs` and node outputs are discarded after the asynchronous run.
2. **ArtifactStore is not process-durable.** Its maps are recreated on restart despite CORE-1 establishing a shared storage provider.
3. **The Studio router owns a private store.** `createStudioRouter()` creates or falls back to a module-level `ArtifactStore`, while generation does not receive that instance.
4. **Project Studio routes use a separate runtime.** `/api/projects/:projectId/studio/status|sync` use `StudioIntegrationManager`; `/api/studio/*` uses the v2 bridge, session manager, protocol dispatcher, and project sync manager. Connections and artifacts are therefore invisible across the two paths.
5. **Project sync fabricates content.** `buildStudioSyncPackage()` creates `src/Main.server.lua` and `src/Config.lua` placeholder payloads labelled `studio-sync-fallback`.
6. **Queueing is not acknowledgement.** The legacy bridge reports success after placing updates into an in-memory queue; it does not prove that the plugin fetched, imported, or acknowledged the generated content.

## Delivery Slices

### STUDIO-1a — Durable artifact lineage

- inject one storage-backed `ArtifactStore` into generation and the Studio v2 router;
- map completed canonical task nodes to existing pipeline stages;
- store real node outputs under the durable execution ID;
- verify reconstruction through a new `ArtifactStore` instance over the same configured provider;
- preserve all existing constructor and router call sites through optional injection where required.

### STUDIO-1b — Shared Studio runtime

- expose one v2 Studio runtime containing bridge, sessions, protocol dispatcher, artifact store, and sync manager;
- make project-level Studio status/sync query that runtime rather than `StudioIntegrationManager`;
- resolve the latest completed execution for the project and return its actual Studio snapshot;
- remove `buildStudioSyncPackage()` only when the real artifact path is covered by tests.

### STUDIO-1c — Plugin acknowledgement proof

- add a plugin-facing command or protocol acknowledgement tied to client ID, execution ID, artifact IDs, hashes, and imported paths;
- persist the delivery receipt or make it queryable from the durable project execution;
- surface verified/unverified delivery in the canonical frontend Integrate stage;
- add end-to-end acceptance covering register → snapshot → artifact transfer → acknowledgement → project status.

## Non-Goals

- no new Studio bridge, artifact store, transport, project store, generation runtime, or frontend Workspace;
- no legacy frontend feature work;
- no claim of successful Studio delivery based only on queue insertion or HTTP 200;
- no removal of fallback behavior until a real package lifecycle is proven.

## Immediate Next Step

Implement STUDIO-1a on a dedicated branch and validate TypeScript, formatting, full backend tests, storage recreation, artifact lineage, and the existing merge gate before starting runtime consolidation.
