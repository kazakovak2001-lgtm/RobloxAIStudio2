# STUDIO-ACCEPT-1 — Real Roblox Studio Desktop Acceptance Result

**Status:** Complete
**Acceptance date:** August 6, 2026, 02:43 CEST
**Tracking issue:** #170
**Roadmap authority:** #169

## Decision

The canonical Studio delivery path passed in a real Roblox Studio desktop
session on the post-INTEGRATION-1A backend baseline. The accepted path was:

```text
project-scoped Studio API key
→ canonical generation execution
→ EXPORT_PROJECT command
→ Roblox instance materialization
→ exact artifact ID/hash receipts
→ backend receipt verification
→ plugin Verified state
```

This result closes the desktop evidence prerequisite identified by
ROADMAP-AUDIT-1. It does not claim Roblox runtime playtest authority, an
artifact-applying repair loop, native asset upload, or external production
deployment.

## Acceptance identity

| Field                                  | Value                                      |
| -------------------------------------- | ------------------------------------------ |
| Backend branch                         | `release/cutover-1e-candidate`             |
| Backend acceptance commit              | `3230d2368ed781043fe9f3520c0d3de3836ec3bb` |
| Post-acceptance documentation baseline | `730f4c5217bd8fd790410c2092dfa88846d4b27f` |
| Frontend audit baseline                | `e89f93d88a3c181b65769641e1a586c86827a6c5` |
| Project ID                             | `proj-00f43b57-b`                          |
| Studio client ID                       | `studio-24c846ea`                          |
| Durable execution ID                   | `exec-1785976885787`                       |
| Export command ID                      | `cmd-eef6e7bd-a`                           |
| Expected artifacts                     | `8`                                        |
| Verified artifacts                     | `8`                                        |
| Plugin version                         | `1.8.0`                                    |
| Bridge protocol                        | `1.0.0`                                    |

The operator flow used authenticated REST directly for project creation,
generation, sync, and status capture. The Frontend commit is retained as the
paired roadmap baseline but was not part of the desktop transport path.

## Acceptance environment

| Field                                 | Value                                                         |
| ------------------------------------- | ------------------------------------------------------------- |
| Host                                  | Microsoft Windows 11 Pro, `10.0.26200`, build `26200`, 64-bit |
| Roblox Studio                         | `0.733.0.7330989`                                             |
| Plugin-reported Studio protocol label | `2024.1`                                                      |
| Backend endpoint                      | `http://127.0.0.1:5000`                                       |
| Storage provider                      | PostgreSQL 16.14                                              |
| LLM mode                              | Stub; generation remained deterministic                       |

The Roblox Studio `version()` result is the authoritative application build
identity. The `2024.1` value is the plugin protocol label and is not treated as
the desktop application version.

## Plugin package provenance

The package was generated locally from backend commit
`3230d2368ed781043fe9f3520c0d3de3836ec3bb` with `npm run studio:package`.
The package source is unchanged by the subsequent architecture-only merge
`730f4c5217bd8fd790410c2092dfa88846d4b27f`.

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Package               | `RobloxAIStudioPlugin-v1.8.0.rbxmx`                                |
| Bundle size           | `47969` bytes                                                      |
| Bundle SHA-256        | `86e102b663d48925f9e313248761bb2d91d7e0794252f6c04e50496d8ba05696` |
| Manifest SHA-256      | `4a249efdbf12acf440298992435dc74865673fbe8e357df809edae93b2701dfc` |
| Canonical Lua sources | `9`                                                                |

An independent `Get-FileHash -Algorithm SHA256` result matched both the
manifest `bundleSha256` value and the generated checksum file.

This exact package identity also depends on the acceptance checkout's recorded
line-ending policy. Git used `core.autocrlf=true`; the nine active Lua files in
the worktree therefore contained 1,387 CRLF sequences and no bare LF sequences.
The current packager hashes the raw checkout text. Reproduction of the accepted
bundle requires the same CRLF checkout transformation. A clean LF checkout of
the cited commit instead produces a `46582`-byte bundle with SHA-256
`9857d9b6e80c4f282036aa2f1038617f1cc09bc6230a2f358553051fc8d0cff7`.

## Authentication boundary

The initial Studio route rejected an API-key-only plugin because project
access resolved only browser users. PR #171 corrected the boundary by requiring
the explicit Studio capability and exact project resource scope while
preserving browser-owner access. The real plugin then connected successfully:

```text
[studio] Client connected: studio-24c846ea (Studio 2024.1)
POST /api/studio/connect 200
GET /api/studio/commands 200
POST /api/studio/heartbeat 200
```

The API key itself was never captured in the evidence and was removed from the
operator environment after the run.

## Generation evidence

Execution `exec-1785976885787` completed all eight canonical pipeline steps
with zero retries:

- requirements;
- planner;
- game designer;
- Roblox architect;
- Lua generator;
- UI generator;
- asset planner;
- orchestrator.

The execution started at `2026-08-06T00:41:25.787Z` and completed at
`2026-08-06T00:41:25.920Z`.

## Command lifecycle evidence

The same client, command, execution, and artifact snapshot were retained
through every command state:

| Lifecycle event            | UTC timestamp              |
| -------------------------- | -------------------------- |
| Studio connection accepted | `2026-08-06T00:36:58.383Z` |
| Command queued             | `2026-08-06T00:43:46.544Z` |
| Command delivered          | `2026-08-06T00:43:47.535Z` |
| Command acknowledged       | `2026-08-06T00:43:47.655Z` |
| Import verified            | `2026-08-06T00:43:47.781Z` |

Delivery preceded acknowledgement by 120 ms. Studio Output independently
reported:

```text
[AI Studio] Export command received: cmd-eef6e7bd-a
[AI Studio] Verified import completed: 8 artifacts (exec-1785976885787)
```

## Exact artifact receipts

| Artifact ID             | Canonical hash     | Materialized instance path                                                 |
| ----------------------- | ------------------ | -------------------------------------------------------------------------- |
| `artifact-76e9124f-afb` | `585d7030febc806f` | `ReplicatedStorage.AIStudioArtifacts.REQUIREMENTS.artifact-76e9124f-afb`   |
| `artifact-251f96d7-ea3` | `ac1564d2eba528e1` | `ReplicatedStorage.AIStudioArtifacts.REQUEST.artifact-251f96d7-ea3`        |
| `artifact-53b5f051-385` | `66a8d5503559a66b` | `ReplicatedStorage.AIStudioArtifacts.GAME_DESIGN.artifact-53b5f051-385`    |
| `artifact-055e75ca-f62` | `343b0ca8988191eb` | `ReplicatedStorage.AIStudioArtifacts.ARCHITECTURE.artifact-055e75ca-f62`   |
| `artifact-f7d9ac6c-391` | `0b3178be0c38b2b2` | `ServerScriptService.DataService`                                          |
| `artifact-1e5a839f-caf` | `b06e9f58f0774fbe` | `ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.artifact-1e5a839f-caf`  |
| `artifact-98586b4d-cd5` | `e5d05ec07732aa27` | `ReplicatedStorage.AIStudioArtifacts.ASSET_PLANNING.artifact-98586b4d-cd5` |
| `artifact-d8657546-462` | `12e3fd8aef929686` | `ReplicatedStorage.AIStudioArtifacts.EXPORT.artifact-d8657546-462`         |

The command result recorded `status=completed`, the exact execution ID, eight
receipts, and identical expected/received artifact identities.

## Authoritative project status

The authenticated project status returned:

```json
{
  "status": "connected",
  "studioId": "studio-24c846ea",
  "lastSyncAt": "2026-08-06T00:43:47.781Z",
  "bridgeVersion": "1.0.0",
  "pendingChanges": 0,
  "artifactVerified": true,
  "verificationStatus": "verified",
  "lastCommandId": "cmd-eef6e7bd-a",
  "verifiedExecutionId": "exec-1785976885787",
  "verifiedArtifactCount": 8
}
```

The plugin panel showed `Verified`. The operator confirmed the seven canonical
metadata stage folders under `ReplicatedStorage/AIStudioArtifacts` and the
generated `ServerScriptService.DataService` script. The place was saved to
Roblox after verification.

## Validation evidence

The merged API-key correction and the acceptance baseline passed:

- Studio access regression suite: 4/4 tests;
- API key store and environment seed/rotation suite: 18/18 tests;
- Studio scope and plugin contract suites: 19/19 tests;
- project TypeScript check;
- checkout-local deterministic plugin package build with the line-ending
  identity recorded above;
- full backend build after PR #172 restored the exhaustive architecture gate;
- PR #172 protected CI: 22/22 checks.

## Non-blocking observations and evidence limits

1. The plugin emitted one startup `POST /api/studio/protocol/message 400` before
   successful REST command polling and heartbeats. It did not interrupt the
   accepted command lifecycle and requires separate protocol-message triage.
2. The package uses `rbxassetid://0`, so Studio reported a missing toolbar icon.
   This is cosmetic and does not affect delivery authority.
3. Studio later reported `Callbacks cannot yield` after the verified import and
   save. No source location was attached, and the authoritative result was
   already complete; it requires independent reproduction before code change.
4. The disposable place contained older metadata values. The current command
   was isolated by its exact eight receipt IDs and paths; cleanup/idempotency of
   unrelated historical metadata belongs to Studio sync hardening (#168).
5. The process-local Studio session ID was not retained before backend shutdown.
   The client ID, command ledger, timestamps, exact receipts, and verified
   project status were retained. No screenshots were committed; this record is
   based on captured text output and authenticated JSON evidence.
6. Plugin packaging is not yet byte-identical across LF and CRLF checkouts. The
   accepted Windows artifact remains exactly identified above; future packaging
   hardening should normalize source line endings before hashing and bundling.

## Closure and next gate

STUDIO-ACCEPT-1 is complete for the canonical generated-artifact import path.
The next product-critical phase identified by ROADMAP-AUDIT-1 is authoritative
Roblox runtime playtest evidence. Static analysis remains a preflight layer and
must not be promoted as a runtime verdict. Artifact-applying repair and
revalidation follows only after the runtime evidence contract is established.
