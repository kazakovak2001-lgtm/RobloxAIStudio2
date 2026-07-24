# STUDIO-1c — Roblox Studio Import Acknowledgement and Verification

**Repository:** `kazakovak2001-lgtm/RobloxAIStudio2`

**Status:** Backend acknowledgement and evidence-verification slice merged and CI-verified; canonical plugin handoff implemented in STUDIO-1d; desktop evidence pending

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

## Backend Verification Record

- PR #10 merged the ACK/result state machine, exact artifact ID/hash verifier, REST and protocol entry points, session semantics, and regression tests.
- PR #11 restored the canonical CI workflow, removed temporary diagnostic automation, applied repository formatting, and corrected optional-field assertions without changing runtime behavior.
- The final canonical run passed TypeScript, ESLint, Prettier, the full test suite, repository validation, commitlint, PostgreSQL restart E2E, and the aggregate Merge Gate.
- The integration branch contains the canonical CI workflow only; no STUDIO-1c diagnostic or self-modifying workflow remains.
- PR #12 synchronized the global project state and roadmap with this verified backend boundary while preserving the real-plugin acceptance gate.

## Canonical Plugin Handoff

The reuse audit originally looked only for a separate plugin repository. The canonical source is instead maintained inside this repository at `studio-plugin/`.

STUDIO-1d upgrades that existing plugin in place to:

- connect with the exact backend project ID;
- poll the existing `EXPORT_PROJECT` queue;
- acknowledge delivered commands;
- materialize structured Lua scripts and non-Lua metadata as real Roblox instances;
- report one exact ID/hash receipt per pipeline artifact;
- show **Verified** only when the STUDIO-1c backend verifier accepts the result.

See [STUDIO-1D_REAL_PLUGIN_ACCEPTANCE.md](./STUDIO-1D_REAL_PLUGIN_ACCEPTANCE.md).

## Acceptance Boundary

The STUDIO-1c backend slice is complete. The canonical plugin implementation is covered by the STUDIO-1d contract test, but the overall STUDIO-1 delivery item must not be marked complete solely because repository tests pass.

Final real-plugin acceptance requires:

1. installation of the canonical `studio-plugin` hierarchy in Roblox Studio;
2. plugin polling of `EXPORT_PROJECT`;
3. plugin acknowledgement through the REST or protocol contract;
4. plugin application of every artifact to Roblox Studio;
5. plugin reporting of the expected artifact ID/hash receipts;
6. server transition to `verified`;
7. project status returning `artifactVerified=true` for the same execution ID;
8. captured evidence from the real Studio session.

Until that proof exists, roadmap status remains STUDIO-1 real-plugin acceptance pending and frontend verification must remain false for unacknowledged sessions.

## Out of Scope

- inventing a synthetic plugin success response;
- marking queue delivery as verified;
- creating a new transport or protocol version;
- persisting the transient command ledger across process restart;
- creating a second plugin instead of maintaining `studio-plugin/`;
- completing CUTOVER-1 before real-plugin acceptance.

## Definition of Done for This Backend Slice

- one existing command ledger enforces the full lifecycle;
- both REST and protocol ACK/result paths use the same runtime verifier;
- exact artifact ID/hash evidence is mandatory for completion;
- failure and mismatch states remain unverified and retryable;
- project status exposes accurate additive verification fields;
- TypeScript, ESLint, Prettier, full tests, repository validation, commitlint, PostgreSQL restart E2E, and Merge Gate pass;
- canonical CI contains no temporary diagnostic or self-modifying workflow;
- documentation explicitly preserves the real-plugin acceptance requirement.
