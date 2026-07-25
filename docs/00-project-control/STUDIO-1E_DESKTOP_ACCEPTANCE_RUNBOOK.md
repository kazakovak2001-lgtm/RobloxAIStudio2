# STUDIO-1e — Desktop Acceptance Packaging and Runbook

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`

**Status:** Installable package automation implemented; human-run Roblox Studio evidence pending

## Objective

Remove the final reproducibility gap before STUDIO-1 desktop acceptance. This slice packages the existing canonical `studio-plugin/` source into an installable Roblox XML model and defines one evidence procedure for the real Studio session.

It does not change Studio runtime behavior, protocol version, command ownership, artifact lineage, receipt verification, or frontend integration.

## Package Contract

Run:

```bash
npm ci
npm run studio:package
```

The command creates three ignored build outputs under `dist/studio-plugin/`:

```text
RobloxAIStudioPlugin-v1.8.0.rbxmx
RobloxAIStudioPlugin-v1.8.0.manifest.json
RobloxAIStudioPlugin-v1.8.0.SHA256SUMS.txt
```

The package is deterministic. Unchanged source files produce byte-identical bundle, manifest, and checksum files.

### Source allowlist

Only the active canonical modules are packaged:

```text
plugin.lua
src/core/Config.lua
src/core/Events.lua
src/services/ConnectionManager.lua
src/services/StudioConnector.lua
src/services/SyncManager.lua
src/ui/CommandPanel.lua
src/utils/ArtifactLoader.lua
src/utils/ErrorReporter.lua
```

Migration inventory such as `_legacy` files and the inactive `RuntimeValidator` are excluded.

### Manifest evidence

The generated manifest records:

- plugin and protocol versions;
- bundle file name, size, and SHA-256;
- every packaged source path;
- Roblox instance path and class;
- source size and SHA-256.

The checksum file covers both the `.rbxmx` bundle and manifest.

## Obtain the Package

### GitHub Actions artifact

The **Studio Plugin Package** workflow builds and uploads the package when plugin packaging changes are reviewed and when those changes reach `feature/plugin-merge`.

1. Open the relevant GitHub Actions run.
2. Download the artifact named `roblox-ai-studio-plugin-<commit-sha>`.
3. Extract the archive to a local folder.
4. Keep the `.rbxmx`, manifest, and checksum file together for the acceptance record.

### Local build

From the repository root:

```bash
npm ci
npm run studio:package
```

Use the files in `dist/studio-plugin/`.

## Verify the Download on Windows

Run PowerShell in the extracted package directory:

```powershell
$bundle = Get-ChildItem -Filter "RobloxAIStudioPlugin-v*.rbxmx" | Select-Object -First 1
$checksumFile = Get-ChildItem -Filter "RobloxAIStudioPlugin-v*.SHA256SUMS.txt" | Select-Object -First 1
$expected = ((Get-Content $checksumFile.FullName | Select-String ([regex]::Escape($bundle.Name))).Line -split "\s+")[0].ToLower()
$actual = (Get-FileHash $bundle.FullName -Algorithm SHA256).Hash.ToLower()

if ($actual -ne $expected) {
  throw "Plugin checksum mismatch. Expected $expected, received $actual."
}

Write-Host "Plugin checksum verified: $actual"
```

Record the verified hash in the evidence table before installing the plugin.

## Install as a Local Plugin

1. Start Roblox Studio and open a disposable blank place.
2. In Studio Settings, enable **Plugin Debugging Enabled** for this acceptance run.
3. Insert `RobloxAIStudioPlugin-v1.8.0.rbxmx` into the place from the local file.
4. In Explorer, select the top-level `RobloxAIStudioPlugin` model.
5. From the **Plugins** menu, select **Save as Local Plugin** and confirm the save.
6. Remove the temporary imported model from the place after the plugin appears in `PluginDebugService`. This prevents two copies of the entry script from being confused during debugging.
7. Reload the plugin or restart Studio if the **Roblox AI Studio** toolbar button is not immediately visible.

The top-level model must retain this hierarchy:

```text
RobloxAIStudioPlugin
├── plugin (Script)
└── src
    ├── core
    ├── services
    ├── ui
    └── utils
```

Do not flatten the model or install only `plugin.lua`; its `require` paths depend on the packaged hierarchy.

## Studio and Backend Preparation

1. In the test experience, enable **Allow HTTP Requests** under Experience Settings → Security.
2. Approve Studio prompts that allow the plugin to communicate with `http://localhost:5000` and modify script source.
3. Start the backend:

   ```bash
   npm run dev:server
   ```

4. Start the canonical standalone frontend from the `Frontend` repository.
5. Sign in and open the target project Workspace.
6. Copy the exact project ID from the Workspace route or project data. Do not substitute the experience name.

## Acceptance Procedure

### 1. Establish the owned Studio session

1. Open the **AI Studio** plugin panel.
2. Paste the exact Workspace project ID into **Project ID**.
3. Select **Connect**.
4. Confirm the panel reaches **Connected / Waiting for export**.
5. Capture the panel and Output window showing the assigned client/session connection.

### 2. Produce a durable execution

1. In the same project Workspace, complete a generation run.
2. Confirm the generation reaches the completed state and contains Studio artifacts.
3. Record the durable execution ID.

### 3. Queue the canonical export

Use the Workspace Studio sync action. It calls:

```text
POST /api/projects/<projectId>/studio/sync
```

The backend must select the newest completed artifact-bearing execution and queue one `EXPORT_PROJECT` command for the connected project session.

Record the returned command ID and execution ID when visible in the browser network response or backend logs.

### 4. Observe the real import lifecycle

The plugin must progress through:

```text
Waiting for export
→ Applying artifacts
→ Verified
```

Confirm in Explorer:

- generated `*.server.lua` outputs are `Script` instances;
- generated `*.client.lua` outputs are `LocalScript` instances;
- generated `*.lua` outputs are `ModuleScript` instances;
- non-Lua pipeline artifacts exist beneath `ReplicatedStorage/AIStudioArtifacts/<STAGE>/<artifactId>` as `StringValue` instances;
- instance paths correspond to the generated artifact paths;
- no placeholder generated source is present.

Capture Explorer and the **Verified** panel state in the same Studio session.

### 5. Capture authoritative backend status

The authenticated project endpoint is:

```text
GET /api/projects/<projectId>/studio/status
```

From the authenticated frontend browser console, the status can be captured with:

```javascript
const projectId = "<PROJECT_ID>";
const result = await fetch(
  `http://localhost:5000/api/projects/${projectId}/studio/status`,
  { credentials: "include" },
).then((response) => response.json());
console.log(JSON.stringify(result, null, 2));
```

The acceptance response must contain:

```json
{
  "success": true,
  "data": {
    "artifactVerified": true,
    "verificationStatus": "verified",
    "verifiedExecutionId": "<THE_COMPLETED_EXECUTION_ID>",
    "verifiedArtifactCount": 1
  }
}
```

`verifiedArtifactCount` must equal the actual snapshot artifact count; the value `1` above is only a shape example.

## Required Evidence Record

| Field | Required value |
| --- | --- |
| Acceptance date and local timezone | Exact timestamp |
| Operating system | Windows or macOS version |
| Roblox Studio version | Version shown by Studio |
| Package artifact name | GitHub artifact or local build reference |
| Bundle SHA-256 | Verified 64-character hash |
| Backend commit | Exact commit SHA |
| Frontend commit | Exact commit SHA |
| Project ID | Exact canonical project ID |
| Studio client/session ID | Connected session identifiers |
| Durable execution ID | Completed generation execution |
| Export command ID | Queued `EXPORT_PROJECT` command |
| Expected artifact count | Snapshot count |
| Verified artifact count | Status response count |
| Plugin panel evidence | Connected, applying, and Verified screenshots |
| Explorer evidence | Generated scripts and metadata hierarchy |
| Status evidence | Full authenticated status JSON |
| Backend log evidence | Connection, queue, acknowledgement, and completion lines |

Attach evidence to a dedicated STUDIO-1 acceptance PR or issue. Do not mark STUDIO-1 complete from screenshots alone if the status JSON does not match the same project and execution.

## Failure Triage

| Symptom | Check |
| --- | --- |
| Toolbar button missing | Plugin hierarchy, `PluginDebugService`, Output syntax errors, reload plugin |
| Connection failed | Backend port, localhost permission, HTTP requests setting, `Config.BACKEND_URL` |
| Connected but no command | Exact project ID, completed artifact-bearing execution, Studio sync request |
| Command delivered but not acknowledged | `SyncManager` polling loop and `/api/studio/commands/:id/acknowledge` response |
| Applying artifacts fails | Output error, path collision, script editing permission, malformed artifact content |
| Plugin reports failure | `/api/studio/commands/:id/result` response and `verificationError` |
| Panel never reaches Verified | Exact artifact receipt IDs/hashes and matching durable execution ID |
| Status shows another execution | Re-run sync only after identifying the latest completed artifact-bearing execution |

A failed import must remain unverified. Fix the cause and queue a fresh authoritative sync; do not edit the status or synthesize a successful receipt.

## Definition of Done

STUDIO-1 can be marked complete only when:

- the package checksum is verified;
- the canonical plugin is installed and running in Roblox Studio;
- the exact project ID owns the Studio session;
- a real `EXPORT_PROJECT` command is acknowledged and applied;
- expected scripts and metadata instances exist in Explorer;
- the plugin panel shows **Verified**;
- project status returns `artifactVerified=true`;
- `verifiedExecutionId` matches the generated execution;
- verified artifact count matches the queued snapshot;
- the complete evidence record is attached and reviewed.

Until then, CUTOVER-1 remains blocked.
