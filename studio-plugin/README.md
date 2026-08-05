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

Files with `_legacy` suffix are migration inventory only and are not used by `plugin.lua` or the canonical package.

## Build the Installable Package

From the repository root:

```bash
npm ci
npm run studio:package
```

The command creates ignored outputs under `dist/studio-plugin/`:

```text
RobloxAIStudioPlugin-v1.8.0.rbxmx
RobloxAIStudioPlugin-v1.8.0.manifest.json
RobloxAIStudioPlugin-v1.8.0.SHA256SUMS.txt
```

The `.rbxmx` model contains the active source hierarchy with `plugin.lua` represented as a `Script` and the remaining active modules represented as `ModuleScript` instances. The manifest records source and bundle SHA-256 values. Unchanged sources produce byte-identical package outputs.

The **Studio Plugin Package** GitHub Actions workflow runs the same command, verifies the checksum file, and uploads an artifact named `roblox-ai-studio-plugin-<commit-sha>`.

See [STUDIO-1e Desktop Acceptance Packaging and Runbook](../docs/00-project-control/STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md) for download verification, local installation, evidence capture, and failure triage.

## Installation Prerequisites

- Roblox Studio with **Allow HTTP Requests** enabled under Experience Settings → Security.
- Permission for the plugin to communicate with the configured backend address and create or edit script source.
- Backend running at the URL configured in `src/core/Config.lua` (`http://localhost:5000` by default).
- The canonical `.rbxmx` package produced by `npm run studio:package` or the GitHub Actions artifact.
- Backend `STUDIO_API_KEY` and `STUDIO_PROJECT_ID` configured together. The project ID must be exact, and the key must use the `rai_<16 hex lookup characters>_<32+ random characters>` format.

## Connection

Generate a key locally before configuring the backend and plugin:

```powershell
node -e "const c=require('node:crypto'); console.log('rai_'+c.randomBytes(8).toString('hex')+'_'+c.randomBytes(32).toString('hex'))"
```

1. Open the **AI Studio** toolbar panel.
2. Copy the project ID from the standalone web Workspace.
3. Paste it into **Project ID**.
4. Paste the matching `STUDIO_API_KEY` into **Studio API key**. It is stored only in local Roblox Studio plugin settings and is not part of the distributed `.rbxmx` package.
5. Restart the backend after setting `STUDIO_API_KEY` and `STUDIO_PROJECT_ID`, then select **Connect**.

The project ID is persisted with plugin settings and is sent to `POST /api/studio/connect`. It must match the project that will queue the export; `game.Name` is not used as an ownership substitute.

At startup, the backend seeds the Studio key as an API principal with only the `studio.project.access` capability and the exact `STUDIO_PROJECT_ID` resource scope. Changing the configured key revokes superseded environment-managed Studio keys; removing both variables revokes all such keys. A missing key is rejected with `401`; a valid key with a different capability or project scope is rejected with `403`. General project routes continue to require the browser owner session.

Configuration errors are fail-fast and stop backend startup. When changing `STUDIO_PROJECT_ID`, generate a new structured key with a new lookup ID, update both the backend and local plugin setting, and restart; successful seeding revokes the superseded environment-managed key.

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

Repository tests validate the plugin source and package contracts, while the backend validates the full ACK/result state machine. Final STUDIO-1 acceptance still requires a human-run Roblox Studio session that captures:

1. the verified package SHA-256;
2. connection with the real project ID;
3. an `EXPORT_PROJECT` command created from a completed generation execution;
4. expected instances in the Roblox hierarchy;
5. plugin panel state **Verified**;
6. project status with `artifactVerified=true` and the same execution ID.
