# Design Document

## Overview

This feature extends the Studio Plugin Communication Protocol (v1.6.1) with a Project Synchronization and Artifact Transfer Layer. The layer sits between the existing `ProtocolDispatcher` / `ArtifactStore` infrastructure and the Roblox Studio plugin, enabling:

- **Project snapshot generation** — Studio plugins can ask the DevKit server for a point-in-time description of the project (artifact references + version hash).
- **Artifact retrieval** — Studio can request the full content of specific artifacts (Lua scripts, asset plans, JSON manifests, etc.) with a 1 MB payload guard.
- **Sync request processing** — Studio can push changes back to DevKit; the server detects conflicts, validates changes, and applies them.
- **Dry-run validation** — Studio can ask the server to validate a set of changes without applying them.
- **REST API surface** — A parallel REST layer (POST /api/studio/sync/project, POST /api/studio/sync/artifacts, GET /api/studio/sync/status) exposes the same operations to the web dashboard.
- **Frontend monitoring** — The existing ProtocolMonitor panel is extended with per-message-type visual differentiation and a live sync status summary.

All server-side logic is fully implemented in `server/src/studio/v2/sync/`. Two small gaps remain: a missing `SyncChange` interface export in `studioBridgeApi.ts` and absent visual differentiation in the `LogRow` component of `ProtocolMonitor.tsx`.

---

## Architecture

The system follows a layered architecture:

```
┌────────────────────────────────────────────────────────────────┐
│                    Roblox Studio Plugin                        │
│              (sends ProtocolMessages over HTTP)                │
└──────────────────────────┬─────────────────────────────────────┘
                           │ POST /api/studio/protocol/message
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                   Express Router (studio.ts)                   │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │               ProtocolDispatcher                        │  │
│   │  register(GET_PROJECT)    → GET_PROJECT handler         │  │
│   │  register(GET_ARTIFACTS)  → GET_ARTIFACTS handler       │  │
│   │  register(SYNC_REQUEST)   → SYNC_REQUEST handler        │  │
│   │  register(VALIDATE)       → VALIDATE handler            │  │
│   └──────────────────────────┬──────────────────────────────┘  │
│                              │ delegates to                     │
│   ┌───────────────┬──────────┴──────┬──────────────────────┐   │
│   │ProjectSync    │  ArtifactTrans  │  SyncValidator       │   │
│   │Manager        │  ferManager     │                      │   │
│   └───────┬───────┴────────┬────────┴──────────────────────┘   │
│           │                │                                     │
│   ┌───────▼────────────────▼──────────────────────────────┐    │
│   │                  ArtifactStore                        │    │
│   └───────────────────────────────────────────────────────┘    │
│                                                                  │
│   REST endpoints (parallel path, same service instances)        │
│   POST /sync/project  POST /sync/artifacts  GET /sync/status   │
└────────────────────────────────────────────────────────────────┘
                           ▲
                           │ fetch()  (5 s poll)
┌──────────────────────────┴─────────────────────────────────────┐
│                  Frontend (React / Vite)                        │
│   studioBridgeApi.ts  →  requestProjectSync()                  │
│                          requestArtifacts()                     │
│                          getSyncStatus()                        │
│   ProtocolMonitor.tsx → protocol log + sync status section     │
└────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- The sync layer reuses the existing `ProtocolDispatcher.register()` mechanism rather than adding a parallel dispatch path, so sync messages appear in the same protocol log as `PING`/`HELLO`/etc.
- `ProjectSyncManager`, `ArtifactTransferManager`, and `SyncValidator` are plain TypeScript classes injected with an `ArtifactStore` at construction time — no framework dependencies, easy to unit test.
- The REST endpoints and the protocol handlers share the same singleton service instances (`syncManager`) within one `createStudioRouter()` call.
- All sync state is currently in-memory. Version identifiers are MD5 hashes of `projectId + seed + UUID fragment`.

---

## Components and Interfaces

### Server-side (`server/src/studio/v2/sync/`)

#### `SyncTypes.ts` — Type definitions module ✅ (complete)

Exports: `ProjectSnapshot`, `ArtifactRef`, `SyncChange`, `SyncChangeType`, `SyncConflict`, `SyncResultStatus`, `SyncResult`, `SyncStatus`.

#### `ProjectSyncManager` ✅ (complete)

```typescript
class ProjectSyncManager {
  constructor(artifactStore: ArtifactStore);
  getProjectSnapshot(pipelineId: string): ProjectSnapshot | null;
  processSyncRequest(pipelineId: string, changes: SyncChange[]): SyncResult;
  validateOnly(pipelineId: string, changes: SyncChange[]): ValidationResult;
  getSyncStatus(pipelineId?: string): SyncStatus;
  getTransferManager(): ArtifactTransferManager;
}
```

Conflict detection logic: a change is in conflict when its `changeType` is `"update"` or `"delete"` and the target artifact's `createdAt` is greater than `change.timestamp` (the artifact was mutated after the change was created on the Studio side).

Version generation: `1.0.0-{md5(projectId + seed + uuid)[0..8]}` — changes on every snapshot recomputation because `uuid` is freshly sampled.

> **Known gap (implementation note):** `"create"` and `"delete"` change types are logged but not fully applied to the `ArtifactStore` (only `"update"` delegates to `artifactStore.edit()`). Full support would require extending `ArtifactStore` with `create()` / `delete()` methods.

#### `ArtifactTransferManager` ✅ (complete)

```typescript
class ArtifactTransferManager {
  constructor(artifactStore: ArtifactStore);
  getArtifactRefs(pipelineId: string): ArtifactRef[]; // metadata only
  transfer(artifactIds: string[]): TransferResult; // with content, 1 MB cap
}
```

Transfer stops adding artifacts once `totalSize` would exceed `MAX_TRANSFER_PAYLOAD_BYTES` (1 MB). Artifacts processed after the limit is hit are silently excluded (not added to `missing` — they are neither returned nor listed as missing when the cap is hit mid-batch).

#### `SyncValidator` ✅ (complete)

```typescript
class SyncValidator {
  validate(changes: SyncChange[], knownArtifactIds: string[]): ValidationResult;
}
```

Validates: artifact type membership, content presence for create/update, artifact existence for update/delete, `changeId` presence, and timestamp validity.

#### `index.ts` ✅ (complete) — re-exports all of the above.

---

### Backend REST + Protocol Registration (`server/src/routes/studio.ts`) ✅ (complete)

Protocol handlers registered via `dispatcher.register()`:

| Message Type    | Delegates To                                         |
| --------------- | ---------------------------------------------------- |
| `GET_PROJECT`   | `syncManager.getProjectSnapshot(projectId)`          |
| `GET_ARTIFACTS` | `syncManager.getTransferManager().transfer(ids)`     |
| `SYNC_REQUEST`  | `syncManager.processSyncRequest(projectId, changes)` |
| `VALIDATE`      | `syncManager.validateOnly(projectId, changes)`       |

REST endpoints:

| Method | Path                         | Handler                           |
| ------ | ---------------------------- | --------------------------------- |
| POST   | `/api/studio/sync/project`   | Returns `ProjectSnapshot`         |
| POST   | `/api/studio/sync/artifacts` | Returns `TransferResult` (or 413) |
| GET    | `/api/studio/sync/status`    | Returns `SyncStatus`              |

---

### Frontend (`src/services/studioBridgeApi.ts`) — 1 gap

All three sync API functions exist: `requestProjectSync`, `requestArtifacts`, `getSyncStatus`.

**Gap: `SyncChange` interface is not exported** (Requirement 6.5). The following interface must be added:

```typescript
export interface SyncChange {
  changeId: string;
  artifactId: string;
  artifactType: string;
  changeType: "create" | "update" | "delete";
  content: unknown;
  timestamp: number;
}
```

---

### Frontend (`src/features/workspace/components/ProtocolMonitor.tsx`) — 1 gap

The `LogRow` component renders all message types identically. **Gap: sync-type messages need distinct visual treatment** (Requirement 7.1).

**Design decision:** Classify `ProtocolMessageType` values into two buckets:

- **Sync messages**: `GET_PROJECT`, `GET_ARTIFACTS`, `SYNC_REQUEST`, `SYNC_RESPONSE`, `VALIDATE` — indicate data-bearing operations.
- **Connection messages**: `PING`, `PONG`, `HELLO`, `READY`, `STATUS` — indicate control/heartbeat operations.

The `LogRow` component should render a different directional icon color (or a supplementary icon badge) for sync messages. Proposed approach: add a `RefreshCw` icon in teal (`text-teal-400`) alongside the existing directional arrow for sync-category messages, leaving connection messages with only the arrow.

```tsx
const SYNC_MESSAGE_TYPES = new Set([
  "GET_PROJECT",
  "GET_ARTIFACTS",
  "SYNC_REQUEST",
  "SYNC_RESPONSE",
  "VALIDATE",
]);

function LogRow({ entry }: { entry: ProtocolLogEntry }) {
  const isSync = SYNC_MESSAGE_TYPES.has(entry.type);
  return (
    <div className="flex items-center justify-between rounded-md bg-white/[0.01] px-2 py-1 text-[10px]">
      <div className="flex items-center gap-1.5">
        {entry.direction === "client_to_server" ? (
          <ArrowUpRight className="h-2.5 w-2.5 text-cyan-400" />
        ) : (
          <ArrowDownLeft className="h-2.5 w-2.5 text-purple-400" />
        )}
        {isSync && <RefreshCw className="h-2.5 w-2.5 text-teal-400" />}
        <span className={isSync ? "text-teal-300" : "text-slate-400"}>
          {entry.type}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-600">{entry.payloadSize}B</span>
        {entry.status === "ok" ? (
          <CheckCircle className="h-2.5 w-2.5 text-green-400" />
        ) : (
          <XCircle className="h-2.5 w-2.5 text-red-400" />
        )}
      </div>
    </div>
  );
}
```

---

## Data Models

### `ProjectSnapshot`

```typescript
interface ProjectSnapshot {
  projectId: string; // pipeline ID from ArtifactStore
  version: string; // "1.0.0-{8-char hash}" — changes on every mutation
  artifacts: ArtifactRef[]; // metadata only — no content
  generatedAt: number; // Unix ms timestamp
  artifactCount: number; // == artifacts.length (redundant, kept for convenience)
}
```

### `ArtifactRef`

```typescript
interface ArtifactRef {
  id: string;
  type: string; // ArtifactType from ArtifactStore
  name: string;
  stage: string; // StageName from PipelineStage
  size: number; // sizeBytes
  hash: string; // sha256 of content, first 16 hex chars
  version: number; // currently always 1
  createdAt: number;
  reviewStatus: string; // ReviewStatus from ArtifactStore
}
```

### `SyncChange`

```typescript
type SyncChangeType = "create" | "update" | "delete";

interface SyncChange {
  changeId: string; // client-generated unique ID
  artifactId: string;
  artifactType: string;
  changeType: SyncChangeType;
  content: unknown; // null/undefined for delete
  timestamp: number; // when the change was created on the Studio side
}
```

### `SyncResult`

```typescript
type SyncResultStatus = "applied" | "conflict" | "no_changes" | "error";

interface SyncResult {
  status: SyncResultStatus;
  appliedChanges: string[]; // changeIds successfully applied
  conflicts: SyncConflict[];
  errors: string[];
  newVersion: string;
  timestamp: number;
}
```

### `SyncConflict`

```typescript
interface SyncConflict {
  changeId: string;
  artifactId: string;
  reason: string;
  localVersion: string; // artifact.createdAt as string
  remoteVersion: string; // change.timestamp as string
}
```

### `SyncStatus`

```typescript
interface SyncStatus {
  lastSyncTimestamp: number | null;
  pendingChanges: number;
  conflictCount: number;
  currentVersion: string;
  projectId: string | null;
}
```

### `TransferResult`

```typescript
interface TransferResult {
  artifacts: Array<{
    id: string;
    type: string;
    name: string;
    stage: string;
    size: number;
    createdAt: number;
    reviewStatus: string;
    content: unknown;
  }>;
  missing: string[];
  totalSize: number;
  payloadExceeded: boolean;
}
```

---

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: Snapshot artifacts match store contents

_For any_ pipeline ID and any set of artifacts stored in the `ArtifactStore` for that pipeline, `getProjectSnapshot()` SHALL return a `ProjectSnapshot` whose `artifacts` array contains exactly one `ArtifactRef` per stored artifact, with matching `id`, `type`, `name`, `stage`, `size`, and `createdAt`.

**Validates: Requirements 1.1, 1.4**

---

### Property 2: Version changes after a mutation

_For any_ project, after any artifact is added or modified, a subsequent call to `getProjectSnapshot()` SHALL return a `version` string that is not equal to the version returned by the preceding call.

**Validates: Requirements 1.3, 3.5**

---

### Property 3: Artifact transfer round-trip

_For any_ artifact stored in the `ArtifactStore`, calling `transfer([artifact.id])` SHALL return a `TransferResult` whose `artifacts` array contains exactly one entry with matching `id`, `type`, `name`, `stage`, `createdAt`, `reviewStatus`, and `content` equal to the stored artifact's content.

**Validates: Requirements 2.1, 2.4**

---

### Property 4: Unknown artifact IDs appear in missing list

_For any_ artifact ID that is not present in the `ArtifactStore`, calling `transfer([unknownId])` SHALL produce a `TransferResult` where `missing` contains that ID and `artifacts` does not contain any entry with that ID.

**Validates: Requirements 2.2**

---

### Property 5: Payload cap is enforced

_For any_ collection of artifact IDs whose combined serialized content exceeds 1,048,576 bytes, `transfer(ids)` SHALL return a `TransferResult` with `payloadExceeded === true`.

**Validates: Requirements 2.5**

---

### Property 6: Valid non-conflicting changes are applied

_For any_ valid set of `SyncChange` objects (valid types, existing artifact IDs for update/delete, non-null content for create/update) where no artifact was modified after each change's `timestamp`, `processSyncRequest()` SHALL return a `SyncResult` with `status === "applied"` and `appliedChanges.length === changes.length`.

**Validates: Requirements 3.2**

---

### Property 7: Conflicting changes produce conflict result

_For any_ `SyncChange` of type `"update"` or `"delete"` where the target artifact's `createdAt` is strictly greater than `change.timestamp`, `processSyncRequest()` SHALL return a `SyncResult` with `status === "conflict"` and that change's ID appearing in `conflicts`.

**Validates: Requirements 3.3**

---

### Property 8: Validation is a pure check — no state mutation

_For any_ set of `SyncChange` objects, calling `validateOnly()` SHALL NOT alter the number of artifacts in the `ArtifactStore`. The artifact count before and after the call SHALL be equal.

**Validates: Requirements 4.1**

---

### Property 9: Invalid artifact types are rejected

_For any_ `SyncChange` whose `artifactType` is not a member of `{ "json", "lua", "markdown", "text", "manifest", "ui-layout", "asset-plan" }`, `validate()` SHALL return a `ValidationResult` with `valid === false` and an error entry whose `changeId` matches the failing change.

**Validates: Requirements 4.2**

---

### Property 10: Missing content is rejected for create/update

_For any_ `SyncChange` with `changeType === "create"` or `changeType === "update"` where `content` is `null` or `undefined`, `validate()` SHALL return a `ValidationResult` with `valid === false` and an error entry for that change.

**Validates: Requirements 4.3**

---

### Property 11: All validation errors are reported

_For any_ set of N `SyncChange` objects that each individually fail validation, the `ValidationResult.errors` array SHALL contain at least one entry per failing change, and every entry's `changeId` SHALL reference a change in the input set.

**Validates: Requirements 4.5**

---

### Property 12: Valid change sets are fully confirmed

_For any_ set of `SyncChange` objects that all pass individual validation rules, `validate()` SHALL return `{ valid: true, validatedCount: changes.length }`.

**Validates: Requirements 4.6**

---

### Property 13: LogRow renders sync messages distinctly

_For any_ `ProtocolLogEntry` whose `type` is one of `GET_PROJECT`, `GET_ARTIFACTS`, `SYNC_REQUEST`, `SYNC_RESPONSE`, or `VALIDATE`, the rendered `LogRow` component SHALL contain a visual element (icon or styled text) that is absent from the rendering of entries whose `type` is one of `PING`, `PONG`, `HELLO`, `READY`, or `STATUS`.

**Validates: Requirements 7.1**

---

## Error Handling

### Protocol handler errors

Every registered handler wraps its logic in validation guards that return `createResponse(msg, "error", {}, reason)` for:

- Missing or non-string `projectId`
- Missing or non-array `artifactIds` / `changes`
- Payload size limit exceeded (GET_ARTIFACTS / POST /sync/artifacts)

Unhandled exceptions propagate to `ProtocolDispatcher.dispatch()`, which catches them and returns a generic error response, logging the entry with `status: "error"`.

### REST endpoint errors

| Condition                                    | HTTP Status | Body                                                                                        |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Missing `projectId`                          | 400         | `{ success: false, error: "projectId is required" }`                                        |
| Project not found (empty store + no version) | 404         | `{ success: false, error: "Project not found" }`                                            |
| Missing / empty `artifactIds`                | 400         | `{ success: false, error: "artifactIds array is required" }`                                |
| Payload > 1 MB                               | 413         | `{ success: false, error: "Payload size limit exceeded…", data: { transferred, missing } }` |

### Sync processing errors

`processSyncRequest` returns `SyncResult.status === "error"` (not a thrown exception) when validation fails. Callers distinguish between protocol-level errors (response.status === "error") and sync-level errors (response.payload.status === "error").

### Version consistency

`getSyncStatus()` returns `currentVersion: "0.0.0"` when no version has been computed for the requested project — this is a safe sentinel rather than an error.

### Frontend error boundary

All `studioBridgeApi.ts` functions return `{ success: boolean; data?: T; error?: string }`. Network or parse errors are caught and surfaced as `{ success: false, error: message }` so the `ProtocolMonitor` can degrade gracefully (null state skips rendering).

---

## Testing Strategy

### Unit Tests

Target modules: `SyncValidator`, `ArtifactTransferManager`, `ProjectSyncManager`.

Focus areas for example-based unit tests:

- `processSyncRequest` with zero changes → `no_changes`
- `processSyncRequest` with a mix of conflicting and non-conflicting changes
- `transfer` with an empty ID list
- `getProjectSnapshot` for a brand-new pipeline ID (empty artifact list)
- REST endpoint HTTP status codes (400, 404, 413)

### Property-Based Tests

Use [fast-check](https://github.com/dubzzz/fast-check) (TypeScript-native PBT library). Each test runs a minimum of 100 iterations.

Tag format: `// Feature: project-sync-artifact-transfer, Property N: <text>`

| Property                                     | Target                                  | Generator inputs                                                |
| -------------------------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| P1 — Snapshot artifacts match store contents | `ProjectSyncManager.getProjectSnapshot` | Arbitrary arrays of `PipelineArtifact`-shaped objects           |
| P2 — Version changes after mutation          | `ProjectSyncManager.getProjectSnapshot` | Arbitrary projectId + artifact sequence                         |
| P3 — Artifact transfer round-trip            | `ArtifactTransferManager.transfer`      | Arbitrary artifacts stored then retrieved                       |
| P4 — Unknown IDs in missing list             | `ArtifactTransferManager.transfer`      | Arbitrary UUID strings not in store                             |
| P5 — Payload cap enforced                    | `ArtifactTransferManager.transfer`      | Large content blobs summing > 1 MB                              |
| P6 — Valid changes applied                   | `ProjectSyncManager.processSyncRequest` | Valid `SyncChange` arrays, timestamps before artifact createdAt |
| P7 — Conflicting changes produce conflict    | `ProjectSyncManager.processSyncRequest` | `SyncChange` with timestamp < artifact.createdAt                |
| P8 — Validation is pure (no mutation)        | `ProjectSyncManager.validateOnly`       | Any `SyncChange` arrays                                         |
| P9 — Invalid artifact types rejected         | `SyncValidator.validate`                | `SyncChange` with arbitrary non-member type strings             |
| P10 — Missing content rejected               | `SyncValidator.validate`                | create/update `SyncChange` with null/undefined content          |
| P11 — All errors reported                    | `SyncValidator.validate`                | N independently-invalid changes                                 |
| P12 — Valid sets confirmed                   | `SyncValidator.validate`                | Valid `SyncChange` arrays                                       |
| P13 — LogRow sync differentiation            | `LogRow` React component                | Arbitrary `ProtocolLogEntry` with sync vs connection types      |

### Integration Tests

- POST /api/studio/sync/project with valid and invalid payloads
- POST /api/studio/sync/artifacts with valid IDs, unknown IDs, and oversized batches
- GET /api/studio/sync/status with and without `projectId` query param
- Protocol handler dispatch for GET_PROJECT, GET_ARTIFACTS, SYNC_REQUEST, VALIDATE
- Handler registration: `dispatcher.getSupportedTypes()` includes all four sync types after router creation

### Smoke / Compilation Tests

- TypeScript compilation succeeds with imports of `SyncChange`, `SyncStatus`, `ProjectSnapshot`, `ArtifactTransferResult` from `studioBridgeApi.ts`
- `SyncTypes.ts` exports all required interfaces without type errors
