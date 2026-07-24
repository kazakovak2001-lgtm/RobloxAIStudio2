# STUDIO-1b — Shared Studio Runtime Consolidation

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`

**Status:** Implemented on draft branch; CI validation pending

## Objective

Remove the split Studio runtime and the project-level placeholder package. Browser project status/sync, plugin registration, sessions, artifact snapshots, artifact transfer, and outbound commands must use one existing Studio v2 runtime.

## Reuse Audit

The repository already contained the required boundaries:

- `StudioBridge` for connected plugin clients and outbound command queues;
- `StudioSessionManager` for active client sessions and heartbeat expiry;
- storage-backed `ArtifactStore` from STUDIO-1a;
- `ProjectSyncManager` and `ArtifactTransferManager` for snapshots and payload limits;
- `StudioIntegrationManager` as the compatibility API used by project routes;
- `EXPORT_PROJECT` in the existing Studio command vocabulary;
- `GET_PROJECT`, `GET_ARTIFACTS`, `SYNC_REQUEST`, and `VALIDATE` in the existing plugin protocol.

STUDIO-1b connects these components. It does not add a second bridge, session registry, artifact store, sync protocol, or generation package model.

## Delivered Changes

### One Studio runtime container

`StudioRuntime` composes the existing v2 bridge, session manager, artifact store, and project sync manager. A process-wide accessor is used by both the compatibility manager and `/api/studio/*` routes.

The runtime owns:

- connected Studio clients;
- active sessions and timeout monitoring;
- the durable artifact store;
- project snapshots and artifact transfer;
- project-to-latest-queued-execution mapping;
- the outbound command queue.

### Compatibility manager becomes a facade

`StudioIntegrationManager` retains its existing public connection, session, metrics, validation, and synchronization methods, but no longer creates its own bridge, registry, synchronizer, or diff state.

New project synchronization calls `synchronizeExecution(studioId, projectId, executionId)`. The compatibility `synchronize(GenerationPackage)` path records a supplied real package into the canonical artifact store and queues it through the same v2 command transport.

### Placeholder package removed

`buildStudioSyncPackage()` and its generated `Main.server.lua` / `Config.lua` fallback content are removed from the project route.

`POST /api/projects/:projectId/studio/sync` now:

1. verifies project ownership;
2. finds a connected Studio session for the same project;
3. loads the project's blueprint and generation executions;
4. selects the newest completed execution that has persisted artifacts;
5. builds the existing Studio snapshot from that execution ID;
6. transfers the real artifact content with the existing 1 MB limit;
7. queues an existing `EXPORT_PROJECT` command for the connected client;
8. returns the execution ID, command ID, queued artifact count, duration, and pending command count.

Completed historical executions without artifacts are skipped. Projects without an artifact-bearing completed generation return `409` instead of receiving synthetic content.

### Existing command queue is now pollable

`GET /api/studio/commands?clientId=...` drains the existing `StudioBridge` command queue. Draining an `EXPORT_PROJECT` command records delivery metadata on the existing session:

- last queued time;
- last delivered time (`lastSyncAt` compatibility field);
- sync count;
- last execution ID;
- last artifact count.

Queueing is not treated as proof that Roblox Studio imported the artifacts. Plugin acknowledgement and import verification remain STUDIO-1c.

## Validation Coverage

`studio1.runtime-consolidation.test.ts` proves:

- one runtime owns artifacts, sessions, and commands;
- a real Lua output is present unchanged in the queued export payload;
- no `studio-sync-fallback` or placeholder script content is introduced;
- project snapshot lookup resolves to the durable execution after queueing;
- command polling drains the queue and records delivery metadata;
- disconnected clients, project mismatches, and artifact-free executions are rejected;
- the compatibility manager and v2 runtime observe the same session and artifact state.

## Preserved Contracts

- existing `StudioIntegrationManager` construction and core methods;
- existing `/api/studio/status`, connect, disconnect, heartbeat, session, events, protocol, snapshot, transfer, and sync-status routes;
- existing Studio protocol version `1.0.0`;
- existing `EXPORT_PROJECT` command type;
- existing project frontend status/sync response fields;
- canonical `PlannerEngine` + `PlanExecutor` generation path;
- CORE-1 storage boundary and STUDIO-1a artifact lineage.

## Out of Scope

STUDIO-1b does not yet:

- add plugin command acknowledgement;
- prove that Roblox Studio created/updated instances from the payload;
- persist the transient command queue across process restart;
- set frontend `studioArtifactVerified` to true;
- remove all legacy Studio source files that may still be imported by historical tests.

Those acceptance steps belong to STUDIO-1c. Legacy source deletion is deferred until usage search and CI prove no remaining consumers.

## Definition of Done

- project sync contains only real persisted artifacts;
- project and plugin routes share one v2 runtime;
- no placeholder package remains in the active project route;
- existing command queue is reachable by plugin polling;
- TypeScript, ESLint, Prettier, full tests, repository validation, commitlint, PostgreSQL restart E2E, and merge gate pass;
- no parallel Studio transport or artifact implementation is introduced.
