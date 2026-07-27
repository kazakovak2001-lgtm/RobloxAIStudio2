# STUDIO-1g — Real Roblox Studio Desktop Acceptance Result

**Status:** Complete  
**Acceptance date:** July 27, 2026, 21:37 CEST  
**Tracking issue:** #15 — closed as completed

## Decision

STUDIO-1 passed on a real Roblox Studio desktop session. The verified path was:

```text
Standalone Frontend Generate
→ canonical specialist-agent pipeline
→ durable execution artifacts
→ EXPORT_PROJECT command
→ Roblox Script / LocalScript / ModuleScript instances
→ exact artifact ID and SHA-256 receipts
→ backend verification
```

CUTOVER-1 is no longer blocked by Studio artifact delivery. Release promotion and legacy frontend removal must still follow `FRONTEND_CUTOVER.md` and use a separately reviewed change set.

## Canonical acceptance identity

| Field                | Value                                      |
| -------------------- | ------------------------------------------ |
| Backend branch       | `feature/plugin-merge`                     |
| Backend commit       | `d99246d813e12bccff0193a15e73de41b92f175d` |
| Frontend commit      | `a8d005d433d48e18d8e64ac176ee63c9c694b644` |
| Project ID           | `proj-286c6929-5`                          |
| Studio client ID     | `studio-39fa03bb`                          |
| Studio session ID    | `session-afec81df-c`                       |
| Durable execution ID | `exec-1785180356168`                       |
| Export command ID    | `cmd-96bd9df4-e`                           |
| Expected artifacts   | `8`                                        |
| Verified artifacts   | `8`                                        |
| Plugin version       | `1.8.0`                                    |
| Bridge protocol      | `1.0.0`                                    |

## Acceptance environment

| Field                                 | Value                      |
| ------------------------------------- | -------------------------- |
| Host                                  | `Windows_NT 10.0.26200`    |
| Roblox Studio                         | `0.730.0.7300790` (64-bit) |
| Channel                               | `production`               |
| Newer Studio available during capture | `0.731.0.7310942`          |

The protocol payload also reported `studioVersion=2024.1`; the desktop About dialog above is the authoritative application build identity.

## Plugin package provenance

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Workflow run          | `30277078815`                                                      |
| Artifact ID           | `8657228073`                                                       |
| Package               | `RobloxAIStudioPlugin-v1.8.0.rbxmx`                                |
| Bundle size           | `45932` bytes                                                      |
| Bundle SHA-256        | `a97e6268193f202cb5cc12ef5c174d0a028067c382327dd9432aacbe80f5ced7` |
| Manifest SHA-256      | `0655ae43b48f8c3bb90591da1e35170ff122136f8352bad73320c88c0eca3f14` |
| Canonical Lua sources | `9`                                                                |

The GitHub Actions artifact was independently downloaded after the desktop run. Its package size, bundle checksum, manifest checksum, and packaged checksum file matched the values above.

## Generation evidence

The fresh post-PR #19 execution retained the planner's specialist assignments:

- `task-requirements → requirements`
- `task-planner → planner`
- `task-game_designer → game_designer`
- `task-roblox_architect → roblox_architect`
- `task-ui_generator → ui_generator`
- `task-asset_planner → asset_planner`
- `task-lua_generator → lua_generator`
- `task-orchestrator → orchestrator`

Execution `exec-1785180356168` completed and produced a non-empty eight-artifact Studio snapshot.

## Command lifecycle evidence

The authenticated Studio session recorded the same command, execution, and artifact set through every state:

| Lifecycle event      | UTC timestamp              |
| -------------------- | -------------------------- |
| Session created      | `2026-07-27T19:35:05.805Z` |
| Command queued       | `2026-07-27T19:37:08.212Z` |
| Command delivered    | `2026-07-27T19:37:08.937Z` |
| Command acknowledged | `2026-07-27T19:37:08.955Z` |
| Import verified      | `2026-07-27T19:37:09.030Z` |

Studio Output independently showed:

```text
[AI Studio] Export command received: cmd-96bd9df4-e
[AI Studio] Verified import completed: 8 artifacts (exec-1785180356168)
```

## Authoritative project status

The authenticated project status returned:

```json
{
  "status": "connected",
  "studioId": "studio-39fa03bb",
  "bridgeVersion": "1.0.0",
  "pendingChanges": 0,
  "artifactVerified": true,
  "verificationStatus": "verified",
  "lastCommandId": "cmd-96bd9df4-e",
  "verifiedExecutionId": "exec-1785180356168",
  "verifiedArtifactCount": 8
}
```

## Roblox instance evidence

The desktop Explorer evidence confirmed:

- `ServerScriptService`
  - `DataService` — Script
  - `EventService` — Script
  - `SpawnService` — Script
- `StarterPlayer/StarterPlayerScripts`
  - `LocalController` — LocalScript
- `ReplicatedStorage/Shared`
  - `GameConfig` — ModuleScript
- `ReplicatedStorage/AIStudioArtifacts`
  - `ARCHITECTURE`
  - `ASSET_PLANNING`
  - `EXPORT`
  - `GAME_DESIGN`
  - `REQUEST`
  - `REQUIREMENTS`
  - `UI_GENERATION`

The plugin panel showed `Verified` for project `proj-286c6929-5`.

## Defects discovered and fixed by real desktop testing

1. **PR #16:** removed the Roblox-forbidden custom `Content-Type` header while preserving `Enum.HttpContentType.ApplicationJson`.
2. **PR #17:** normalized real `LuaGeneratorAgent` groups into the canonical non-empty Studio `scripts[]` payload.
3. **PR #19:** prevented first-run adaptive selection from replacing every planner-assigned specialist with `requirements` when no performance evidence existed.

## Closure

STUDIO-1 is complete. Issue #15 is closed as completed. The next authorized roadmap item is CUTOVER-1 release promotion preparation; this result does not authorize direct merging of the oversized integration PR or immediate deletion of the embedded frontend without the remaining cutover gates, conflict review, rollback plan, and clean validation run.
