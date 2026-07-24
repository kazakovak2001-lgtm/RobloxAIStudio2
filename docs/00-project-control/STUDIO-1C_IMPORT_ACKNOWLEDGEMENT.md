# STUDIO-1c — Roblox Studio Import Acknowledgement and Verification

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`

**Status:** Backend acknowledgement and evidence verification implemented on working branch; CI and real-plugin acceptance pending

## Objective

Close the semantic gap between delivering generated artifacts to the Studio command queue and proving that Roblox Studio actually applied the expected artifacts.

STUDIO-1b established one shared runtime and a real `EXPORT_PROJECT` payload. Queue delivery alone is not import verification. STUDIO-1c adds an acknowledgement/result state machine and validates plugin-reported artifact evidence before any project session may report a verified Studio sync.

## Reuse Audit

The existing codebase already defined the required vocabulary:

- `StudioCommand.status`: `pending`, `sent`, `acknowledged`, `completed`, `failed`;
- `StudioBridge` command polling;
- `StudioSessionManager` active sessions;
- Studio events `export.started`, `export.completed`, and `export.failed`;
- protocol dispatcher and validator at major version `1.0.0`;
- artifact snapshot references containing artifact IDs and SHA-256 content hashes;
- project Studio status exposed through the existing compatibility manager.

These contracts existed but were not connected. STUDIO-1c activates them. It does not add a second protocol, queue, bridge, session registry, artifact store, or transport.

## Delivered Backend Contract

### Command lifecycle ledger

`StudioBridge` retains every queued command and enforces ownership and state transitions:

1. `sent` — command was queued;
2. delivery metadata — plugin fetched the command through polling, while status remains `sent`;
3. `acknowledged` — plugin explicitly accepted responsibility for the command;
4. `completed` — exact artifact evidence was verified;
5. `failed` — plugin reported failure or evidence verification failed.

Commands cannot be completed before acknowledgement. A command cannot be acknowledged before the plugin has fetched it. Client IDs must match the command owner.

### Existing protocol extension

Protocol major version remains `1.0.0`. Two additive message types are registered through the existing dispatcher and validator:

- `COMMAND_ACK` with `clientId` and `commandId`;
- `COMMAND_RESULT` with `clientId`, `commandId`, `status`, `executionId`, artifact receipts, and optional error/report time.

The same runtime methods are exposed through REST for polling plugins and diagnostics:

- `GET /api/studio/commands?clientId=...` — fetch pending commands;
- `GET /api/studio/commands/:commandId?clientId=...` — inspect lifecycle state;
- `POST /api/studio/commands/:commandId/acknowledge`;
- `POST /api/studio/commands/:commandId/result`.

REST and protocol paths share the same parser, command ledger, ownership checks, state transitions, and evidence verifier.

### Exact artifact evidence

A successful result must report:

- the exact durable generation execution ID from the queued export;
- one receipt for every expected artifact;
- no duplicate artifact IDs;
- no missing or additional receipts;
- the exact SHA-256 hash supplied in the queued project snapshot for each artifact;
- an optional Roblox instance path for diagnostics.

Any mismatch closes the command as failed, records a verification error, emits `export.failed`, and clears the incremental export signature so the browser may queue a fresh authoritative retry.

### Session verification semantics

The shared Studio session distinguishes:

- `idle`;
- `queued`;
- `delivered`;
- `acknowledged`;
- `verified`;
- `failed`.

`lastSyncAt` and `artifactVerified=true` are set only after exact completion evidence passes. Polling, queue drainage, and acknowledgement never set them.

Project `/studio/status` and `/studio/sync` responses now include additive fields:

- `artifactVerified`;
- `verificationStatus`;
- `lastCommandId`;
- `verifiedExecutionId`;
- `verifiedArtifactCount`;
- `verificationError`.

Existing status, connection, pending-change, bridge-version, execution, and command fields are preserved.

## Validation Coverage

`studio1.import-acknowledgement.test.ts` covers:

- queue → poll → acknowledge → exact completion evidence → verified session;
- unchanged real Lua content and snapshot hashes;
- `lastSyncAt` remaining unset until verified completion;
- `export.started`, `export.completed`, and `export.failed` events;
- hash mismatch failure and a fresh retry command;
- explicit plugin import failure;
- wrong-client rejection;
- acknowledgement before polling rejection;
- completion before acknowledgement rejection.

The STUDIO-1b runtime test is updated to protect the boundary that command delivery is not artifact verification.

## Connected-Repository Limitation

The connected GitHub account currently exposes only:

- `kazakovak2001-lgtm/RobloxAIStudio2`;
- `kazakovak2001-lgtm/Frontend`.

No separate Roblox Studio plugin source repository is available in the connected project. Therefore this slice can implement and automatically validate the server contract, but it cannot honestly prove that a real installed Roblox plugin created or updated Roblox instances.

## Acceptance Boundary

STUDIO-1c must not be marked complete solely because backend tests pass.

Final real-plugin acceptance requires:

1. plugin polling of `EXPORT_PROJECT`;
2. plugin acknowledgement using `COMMAND_ACK` or the REST equivalent;
3. plugin application of every artifact to Roblox Studio;
4. plugin computation/reporting of the expected artifact ID/hash receipts;
5. server transition to `verified`;
6. project status returning `artifactVerified=true` for the same execution ID;
7. captured evidence from the real Studio session.

Until that proof exists, roadmap status remains STUDIO-1c active and frontend verification must remain false for unacknowledged sessions.

## Out of Scope

- inventing a synthetic plugin success response;
- marking queue delivery as verified;
- creating a new transport or protocol version;
- persisting the transient command ledger across process restart;
- implementing Roblox Lua plugin code without the canonical plugin source;
- completing CUTOVER-1 before real-plugin acceptance.

## Definition of Done for This Backend Slice

- one existing command ledger enforces the full lifecycle;
- both REST and protocol ACK/result paths use the same runtime verifier;
- exact artifact ID/hash evidence is mandatory for completion;
- failure and mismatch states remain unverified and retryable;
- project status exposes accurate additive verification fields;
- TypeScript, ESLint, Prettier, full tests, repository validation, commitlint, PostgreSQL restart E2E, and Merge Gate pass;
- documentation explicitly preserves the real-plugin acceptance requirement.
