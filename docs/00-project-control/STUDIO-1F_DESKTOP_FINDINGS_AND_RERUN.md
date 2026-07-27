# STUDIO-1f — Real Desktop Findings and Authoritative Rerun

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`  
**Status:** Runtime fixes merged; fresh real Roblox Studio verification pending  
**Date:** July 27, 2026

## Objective

Record the two defects found only after running the canonical plugin in a real Roblox Studio desktop session, define the repaired contract, and prevent STUDIO-1 from being closed with stale package data or a generation execution created before the fixes.

This document extends the STUDIO-1e packaging runbook. It does not replace the original package, installation, or evidence procedure.

## Pre-implementation and duplication review

Both defects were fixed at existing ownership boundaries:

- HTTP transport remained in the canonical `studio-plugin/src/services/StudioConnector.lua` implementation;
- generation-to-Studio normalization remained in the existing `GenerationArtifactRecorder`;
- no alternate connector, plugin, endpoint, artifact store, command queue, frontend panel, or generation pipeline was introduced.

## Desktop finding 1 — Roblox forbidden header

A real Studio session could reach `GET http://localhost:5000/health`, but the plugin connection POST failed before reaching Express:

```text
Header "Content-Type" is not allowed!
```

### Root cause

The plugin supplied `Content-Type` inside the custom header table while also selecting `Enum.HttpContentType.ApplicationJson`. Roblox owns that header and rejects the duplicate custom value.

### Resolution

PR #16 removed the forbidden custom header and omits the optional headers argument when no custom headers remain. JSON content type continues to be provided through `Enum.HttpContentType.ApplicationJson`.

- PR: #16 `fix(studio): allow plugin POST requests in Roblox Studio`
- Merge commit: `37b869ab4bacbc1129dbbbcd01466f4602e51d54`

## Desktop finding 2 — Lua artifact shape mismatch

After connection and real `EXPORT_PROJECT` delivery, plugin materialization failed with:

```text
Lua artifact content must contain a non-empty scripts array
```

### Root cause

The existing `LuaGeneratorAgent` emits real code as:

```text
lua_generator.server[]
lua_generator.client[]
lua_generator.shared[]
lua_generator.modules[]
```

using `{ name, code }` entries. The plugin imports the canonical Studio shape:

```json
{
  "scripts": [
    {
      "path": "ServerScriptService/Example.server.lua",
      "content": "..."
    }
  ]
}
```

The recorder previously stored the agent output without converting this boundary.

### Resolution

PR #17 extended the existing `GenerationArtifactRecorder` to:

- preserve already-canonical non-empty `scripts[]` output;
- normalize server entries to `ServerScriptService/*.server.lua`;
- normalize client entries to `StarterPlayerScripts/*.client.lua`;
- normalize shared/modules to `ReplicatedStorage/Shared/*.lua`;
- reject empty, malformed, and duplicate-path Lua output before queueing;
- cover the exact current `LuaGeneratorAgent` shape with regression tests.

- PR: #17 `fix(studio): normalize generated Lua artifacts before export`
- Merge commit and current integration head: `5e560069758b1b7a2444e40042dcf21c10636623`

## Current canonical package

Use the package produced from the PR #17 source and merged unchanged into `feature/plugin-merge`:

| Field                       | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Workflow run                | `30277078815`                                                      |
| Artifact ID                 | `8657228073`                                                       |
| Artifact name               | `roblox-ai-studio-plugin-4691632dc7a8a0e60d35602f8dccd3368b09f406` |
| Artifact source commit      | `f98671ae44b51b9f456edd3e4441a6ab335482d4`                         |
| Integration commit          | `5e560069758b1b7a2444e40042dcf21c10636623`                         |
| Bundle file                 | `RobloxAIStudioPlugin-v1.8.0.rbxmx`                                |
| Bundle size                 | `45932` bytes                                                      |
| Bundle SHA-256              | `a97e6268193f202cb5cc12ef5c174d0a028067c382327dd9432aacbe80f5ced7` |
| Manifest SHA-256            | `0655ae43b48f8c3bb90591da1e35170ff122136f8352bad73320c88c0eca3f14` |
| Active packaged Lua sources | 9                                                                  |

The earlier acceptance values of `45185` bytes and bundle SHA beginning `5e01fbcb` are superseded.

## Mandatory rerun boundary

Existing malformed persisted executions are not rewritten. Final acceptance must therefore use a generation execution created after commit `5e560069758b1b7a2444e40042dcf21c10636623` is running.

Required order:

1. verify the current package checksum;
2. run backend commit `5e560069758b1b7a2444e40042dcf21c10636623` on port 5000;
3. run the canonical standalone Frontend and record its exact commit;
4. connect the plugin using the exact backend project ID;
5. create a fresh generation execution;
6. confirm the execution reaches `completed` and has a non-empty Studio artifact snapshot;
7. queue Studio Sync for the same project;
8. observe `Waiting for export → Applying artifacts → Verified`;
9. verify Script, LocalScript, ModuleScript, and non-Lua metadata instances in Explorer;
10. capture authenticated status with `artifactVerified=true`, `verificationStatus=verified`, matching execution ID, and matching artifact count.

## Non-closure conditions

STUDIO-1 remains open when any of the following is true:

- only plugin connection is proven;
- only package or CI validation is proven;
- the execution predates PR #17;
- queue delivery or acknowledgement occurs without verified result evidence;
- screenshots do not match the same project, execution, command, and artifact set;
- `artifactVerified` is not `true`;
- `verifiedExecutionId` or artifact counts do not match.

## Source of truth

GitHub issue #15 contains the live acceptance checklist and evidence record. CUTOVER-1 remains blocked until that issue is completed with matching real desktop evidence.
