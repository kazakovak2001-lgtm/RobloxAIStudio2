# STUDIO-1d — Canonical Roblox Plugin Import Acceptance

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`

**Status:** Plugin implementation in draft; automated contract validation and manual Roblox Studio evidence pending

## Objective

Complete the Studio side of the existing STUDIO-1c acknowledgement/result contract by upgrading the canonical plugin source at `studio-plugin/`. No second plugin, queue, bridge, protocol, artifact store, or sync manager is introduced.

## Reuse Audit

The repository already contained a canonical Alpha v1.7 plugin with:

- `plugin.lua` entry point;
- `StudioConnector` HTTP/protocol adapter;
- `ConnectionManager` heartbeat and reconnect lifecycle;
- `SyncManager` synchronization service;
- `ArtifactLoader` Roblox instance creation;
- `CommandPanel` toolbar UI;
- shared `Events` and `ErrorReporter` modules.

The implementation was incomplete and internally inconsistent:

- active service modules required `Config` from an invalid relative path;
- `ConnectionManager.new` did not match its entry-point arguments and did not retain `Events`;
- reconnects did not reuse the requested backend project ID;
- `SyncManager` used the pre-STUDIO-1b `GET_PROJECT` / `GET_ARTIFACTS` path, read the wrapped response incorrectly, and declared methods after `return SyncManager`;
- `ArtifactLoader` treated every pipeline artifact as one ModuleScript and replaced structured Lua output with placeholder content;
- no command polling, acknowledgement, result reporting, or artifact receipts existed;
- the panel contained malformed Luau and used `game.Name` as the project ownership key.

STUDIO-1d repairs these existing modules in place.

## Delivered Plugin Contract

### Project ownership

The existing panel now requires the canonical backend project ID. It is stored in plugin settings and passed to `POST /api/studio/connect`, including reconnect attempts. `game.Name` is not used as a substitute for project ownership.

### Command polling

The existing `SyncManager` automatically polls:

```text
GET /api/studio/commands?clientId=<clientId>
```

every two seconds after `STUDIO_CONNECTED`. The manual **Check Export Queue** button invokes the same polling method and does not create a parallel synchronization path.

Only `EXPORT_PROJECT` is accepted by the import path.

### Required lifecycle

For each delivered export the plugin performs:

1. validate `projectId`, durable `executionId`, snapshot references, and transferred artifacts;
2. acknowledge through `POST /api/studio/commands/:commandId/acknowledge`;
3. materialize every transferred pipeline artifact;
4. create exactly one receipt per snapshot artifact using its expected ID and hash;
5. report `completed` through `POST /api/studio/commands/:commandId/result`;
6. expose **Verified** only when the backend returns `verified=true`.

Materialization failures are reported as `failed` with the same execution ID and available partial receipts. Queue delivery or acknowledgement alone never produces a verified UI state.

## Artifact Materialization

### Lua generation artifacts

A `lua` pipeline artifact must contain:

```text
content.scripts[] = { path, content }
```

Each declared script is created or updated at its actual Roblox hierarchy path:

- `*.server.lua` → `Script`;
- `*.client.lua` → `LocalScript`;
- `*.lua` → `ModuleScript`.

Supported service roots include `ServerScriptService`, `ReplicatedStorage`, `ServerStorage`, `StarterGui`, `StarterPlayer`, `StarterPlayerScripts`, `StarterCharacterScripts`, and `Workspace`. Unknown roots are preserved beneath `ReplicatedStorage`.

### Non-Lua artifacts

JSON, manifests, UI layouts, asset plans, text, and documentation artifacts are materialized as `StringValue` instances beneath:

```text
ReplicatedStorage/AIStudioArtifacts/<STAGE>/<artifactId>
```

The value contains the original content and attributes record artifact identity, type, name, and pipeline stage. This prevents non-Lua outputs from being misrepresented as generated scripts while still producing a real Roblox instance for every expected pipeline artifact.

## Automated Contract Coverage

`server/src/__tests__/studio1.plugin-contract.test.ts` reads the canonical plugin source and guards:

- one connector/lifecycle/loader/sync composition;
- correct active module paths and constructor signatures;
- exact project ID ownership input and persistence;
- REST command polling, acknowledgement, and result endpoints;
- ACK before completed result ordering;
- removal of the old live `GET_PROJECT` / `GET_ARTIFACTS` sync path;
- Lua `content.scripts[]` materialization without placeholder source;
- metadata `StringValue` materialization;
- one exact ID/hash receipt per queued pipeline artifact;
- verified backend response requirement;
- active module structure and removal of malformed panel syntax.

These checks run inside the standard backend test suite and merge gate.

## Acceptance Evidence Still Required

Automated repository validation cannot launch the Roblox Studio desktop application. Final STUDIO-1 acceptance requires a human-run Studio session with captured evidence:

1. package/install the canonical `studio-plugin` source while preserving its hierarchy;
2. enable HTTP Requests and script editing permission;
3. run the backend and standalone Workspace;
4. paste the exact Workspace project ID into the plugin panel;
5. connect the plugin;
6. complete a generation and queue Studio sync from the same project;
7. verify expected scripts and metadata instances in Explorer;
8. capture plugin panel state **Verified**;
9. capture project status with `artifactVerified=true`, matching `verifiedExecutionId`, and the expected artifact count.

Until this evidence is attached to the delivery record, STUDIO-1 remains active and CUTOVER-1 remains blocked.

## Out of Scope

- a second Roblox plugin implementation;
- a new transport or protocol major version;
- synthetic command results;
- marking queue delivery as import completion;
- changing generation artifact lineage or backend verification semantics;
- CUTOVER-1 or legacy frontend removal before real Studio evidence.
