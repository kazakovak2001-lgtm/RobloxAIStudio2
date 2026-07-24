# Roblox AI Studio Plugin — v1.8

Canonical Roblox Studio plugin for importing durable generation artifacts from the Roblox AI Studio backend.

## Responsibility

The plugin is the Studio-side adapter for the existing shared Studio runtime. It does not generate games and it does not define a second synchronization protocol.

Its responsibilities are:

1. connect a Roblox Studio instance to an existing backend project ID;
2. maintain heartbeat and reconnect lifecycle;
3. poll the existing `EXPORT_PROJECT` command queue;
4. acknowledge a command only after it has been delivered by polling;
5. materialize every queued pipeline artifact in Roblox Studio;
6. report one receipt per pipeline artifact using the exact snapshot artifact ID and SHA-256 hash;
7. display verified or failed import state in the existing plugin panel.

## Source Layout

```text
studio-plugin/
├── plugin.lua
└── src/
    ├── core/
    │   ├── Config.lua
    │   └── Events.lua
    ├── services/
    │   ├── ConnectionManager.lua
    │   ├── StudioConnector.lua
    │   └── SyncManager.lua
    ├── ui/
    │   └── CommandPanel.lua
    └── utils/
        ├── ArtifactLoader.lua
        └── ErrorReporter.lua
```

Files with `_legacy` suffix are migration inventory only and are not used by `plugin.lua`.

## Installation Prerequisites

- Roblox Studio with **Allow HTTP Requests** enabled under Game Settings → Security.
- Permission for the plugin to create and edit scripts.
- Backend running at the URL configured in `src/core/Config.lua` (`http://localhost:5000` by default).
- The source hierarchy above must be preserved when packaging or installing the plugin.

## Connection

1. Open the **AI Studio** toolbar panel.
2. Copy the project ID from the standalone web Workspace.
3. Paste it into **Project ID**.
4. Select **Connect**.

The project ID is persisted with plugin settings and is sent to `POST /api/studio/connect`. It must match the project that will queue the export; `game.Name` is not used as an ownership substitute.

The plugin then:

- sends the existing protocol `HELLO` message;
- starts heartbeat every 15 seconds;
- reconnects with the same project ID after transient failures;
- starts command polling every two seconds.

## Verified Import Flow

```text
Backend Workspace
    │ queue canonical execution artifacts
    ▼
GET /api/studio/commands?clientId=...
    │ delivers EXPORT_PROJECT
    ▼
POST /api/studio/commands/:commandId/acknowledge
    │ plugin accepts responsibility
    ▼
ArtifactLoader materializes every artifact
    │
    ├─ LUA_GENERATION content.scripts[]
    │    ├─ *.server.lua → Script
    │    ├─ *.client.lua → LocalScript
    │    └─ *.lua → ModuleScript
    │
    └─ JSON, manifest, UI, asset, text, and documentation artifacts
         → ReplicatedStorage/AIStudioArtifacts/<STAGE>/<artifactId> StringValue
    ▼
POST /api/studio/commands/:commandId/result
    │ exact execution ID + artifact ID/hash receipts
    ▼
Backend verificationStatus = verified
```

The plugin reports `completed` only after all queued pipeline artifacts are materialized. Any loader failure is reported as `failed`. Queue delivery and acknowledgement alone never produce a verified state.

## Script Path Mapping

Generated Lua scripts use their declared `path` field. Supported roots include:

- `ServerScriptService`
- `ReplicatedStorage`
- `ServerStorage`
- `StarterGui`
- `StarterPlayer`
- `StarterPlayerScripts`
- `StarterCharacterScripts`
- `Workspace`

Unknown roots are placed under `ReplicatedStorage` while preserving the remaining folder path.

Existing instances with the same path and compatible class are updated. An incompatible existing instance is replaced. A non-folder path collision fails the import and is reported to the backend.

## Command and Protocol Contract

Protocol major version remains `1.0.0`. Existing protocol messages remain available, including `HELLO`, `PING`, `PONG`, `STATUS`, `GET_PROJECT`, `GET_ARTIFACTS`, `SYNC_REQUEST`, `SYNC_RESPONSE`, `VALIDATE`, and `ERROR`.

STUDIO-1c adds backend support for `COMMAND_ACK` and `COMMAND_RESULT`; plugin v1.8 uses the equivalent REST command endpoints so polling, acknowledgement, result validation, command ownership, and project status all operate on the same server-side command ledger.

## Panel States

- **Disconnected** — no active backend client.
- **Connected / Waiting for export** — polling the queue.
- **Applying artifacts** — command was acknowledged and instances are being created or updated.
- **Verified** — backend accepted the exact artifact receipts.
- **Import Failed** — materialization, transport, ownership, or evidence verification failed.

The **Check Export Queue** button triggers the same polling method used by the automatic loop. It is not a second synchronization path.

## Acceptance Boundary

Repository tests validate the plugin source contract and the backend validates the full ACK/result state machine. Final STUDIO-1 acceptance still requires a human-run Roblox Studio session that captures:

1. connection with the real project ID;
2. an `EXPORT_PROJECT` command created from a completed generation execution;
3. expected instances in the Roblox hierarchy;
4. plugin panel state **Verified**;
5. project status with `artifactVerified=true` and the same execution ID.
