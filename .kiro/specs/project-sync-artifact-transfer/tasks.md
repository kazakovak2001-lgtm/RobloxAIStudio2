# Implementation Plan: Project Sync Artifact Transfer

## Overview

The server-side sync layer (`server/src/studio/v2/sync/`) and the backend REST + protocol registration in `server/src/routes/studio.ts` are already complete. This plan focuses on:

1. Verifying / smoke-testing the existing server-side modules compile and wire correctly.
2. Fixing the two frontend gaps (`SyncChange` export in `studioBridgeApi.ts`; `LogRow` visual differentiation in `ProtocolMonitor.tsx`).
3. Writing the full test suite — unit tests, 13 property-based tests (fast-check), integration tests, and smoke/compilation tests.

All tasks are TypeScript unless otherwise noted.

---

## Tasks

- [x] 1. Smoke-test existing server-side sync modules
  - [x] 1.1 Verify TypeScript compilation of `server/src/studio/v2/sync/` barrel
    - Confirm `index.ts` re-exports `SyncTypes`, `ProjectSyncManager`, `ArtifactTransferManager`, `SyncValidator` without type errors.
    - Import the barrel in a temporary test file (`server/src/studio/v2/sync/__tests__/smoke.test.ts`); assert imported symbols are defined.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1_

  - [x] 1.2 Verify protocol handler registration in `studio.ts`
    - Write a test that constructs the router via `createStudioRouter()`, extracts the `ProtocolDispatcher` mock, and asserts that `GET_PROJECT`, `GET_ARTIFACTS`, `SYNC_REQUEST`, and `VALIDATE` are present in `dispatcher.getSupportedTypes()`.
    - _Requirements: 9.1, 9.2_

- [x] 2. Fix frontend gap — export `SyncChange` interface from `studioBridgeApi.ts`
  - [x] 2.1 Add `SyncChange` export to `src/services/studioBridgeApi.ts`
    - Add the `SyncChange` interface as specified in the design (fields: `changeId`, `artifactId`, `artifactType`, `changeType`, `content`, `timestamp`).
    - Confirm all four required interfaces are exported: `SyncStatus`, `ProjectSnapshot`, `SyncChange`, `ArtifactTransferResult`.
    - _Requirements: 6.5_

  - [ ] 2.2 Write smoke/compilation test for `studioBridgeApi.ts` exports
    - Create `src/services/__tests__/studioBridgeApi.smoke.test.ts`.
    - Import `SyncChange`, `SyncStatus`, `ProjectSnapshot`, `ArtifactTransferResult` from `studioBridgeApi.ts` and assert they are assignable (use typed variable assignments rather than runtime checks).
    - _Requirements: 6.5_

- [ ] 3. Fix frontend gap — `LogRow` visual differentiation in `ProtocolMonitor.tsx`
  - [ ] 3.1 Update `LogRow` component in `src/features/workspace/components/ProtocolMonitor.tsx`
    - Define `SYNC_MESSAGE_TYPES` set: `GET_PROJECT`, `GET_ARTIFACTS`, `SYNC_REQUEST`, `SYNC_RESPONSE`, `VALIDATE`.
    - Render a `RefreshCw` icon (`text-teal-400`, `h-2.5 w-2.5`) for sync-category entries, absent for connection messages.
    - Apply `text-teal-300` to the type label for sync messages and `text-slate-400` for connection messages.
    - Import `RefreshCw` from `lucide-react` alongside existing imports.
    - _Requirements: 7.1_

  - [ ] 3.2 Write property test P13 — `LogRow` sync differentiation
    - **Property 13: LogRow renders sync messages distinctly**
    - **Validates: Requirements 7.1**
    - File: `src/features/workspace/components/__tests__/ProtocolMonitor.pbt.test.tsx`
    - Use fast-check `fc.constantFrom(...)` to generate `ProtocolLogEntry` instances with sync types and connection types.
    - Assert that sync entries render a `RefreshCw` element and that connection entries do not.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 13: LogRow renders sync messages distinctly`

- [ ] 4. Unit tests for `SyncValidator`
  - [ ] 4.1 Write unit tests for `SyncValidator.validate`
    - File: `server/src/studio/v2/sync/__tests__/SyncValidator.unit.test.ts`
    - Cover: valid artifact types accepted; invalid type rejected with matching `changeId` in errors; null/undefined content rejected for `create`/`update`; non-null content accepted; unknown artifact ID rejected for `update`/`delete`; missing `changeId` rejected; invalid timestamp rejected; mixed valid+invalid set returns all errors.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 4.2 Write property test P9 — invalid artifact types rejected
    - **Property 9: Invalid artifact types are rejected**
    - **Validates: Requirements 4.2**
    - File: `server/src/studio/v2/sync/__tests__/SyncValidator.pbt.test.ts`
    - Use `fc.string()` filtered to exclude valid types; assert `valid === false` and error entry references the change.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 9: Invalid artifact types are rejected`

  - [ ] 4.3 Write property test P10 — missing content rejected for create/update
    - **Property 10: Missing content is rejected for create/update**
    - **Validates: Requirements 4.3**
    - File: `server/src/studio/v2/sync/__tests__/SyncValidator.pbt.test.ts` (same file, separate `test` block)
    - Use `fc.constantFrom("create", "update")` combined with `fc.constant(null)` / `fc.constant(undefined)`.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 10: Missing content rejected for create/update`

  - [ ] 4.4 Write property test P11 — all validation errors are reported
    - **Property 11: All validation errors are reported**
    - **Validates: Requirements 4.5**
    - File: `server/src/studio/v2/sync/__tests__/SyncValidator.pbt.test.ts`
    - Generate arrays of N individually-invalid changes; assert `errors.length >= N` and every `changeId` in errors is in the input set.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 11: All validation errors are reported`

  - [ ] 4.5 Write property test P12 — valid sets fully confirmed
    - **Property 12: Valid change sets are fully confirmed**
    - **Validates: Requirements 4.6**
    - File: `server/src/studio/v2/sync/__tests__/SyncValidator.pbt.test.ts`
    - Generate arrays of fully-valid `SyncChange` objects; assert `valid === true` and `validatedCount === changes.length`.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 12: Valid change sets are fully confirmed`

- [ ] 5. Unit tests for `ArtifactTransferManager`
  - [ ] 5.1 Write unit tests for `ArtifactTransferManager`
    - File: `server/src/studio/v2/sync/__tests__/ArtifactTransferManager.unit.test.ts`
    - Cover: empty ID list returns empty artifacts; single known ID returns correct content and metadata; unknown ID appears in `missing`; multiple known IDs all returned; mix of known/unknown IDs handled correctly.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 5.2 Write property test P3 — artifact transfer round-trip
    - **Property 3: Artifact transfer round-trip**
    - **Validates: Requirements 2.1, 2.4**
    - File: `server/src/studio/v2/sync/__tests__/ArtifactTransferManager.pbt.test.ts`
    - Store arbitrary artifact; call `transfer([id])`; assert returned entry matches stored artifact on all metadata fields and content.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 3: Artifact transfer round-trip`

  - [ ] 5.3 Write property test P4 — unknown artifact IDs appear in missing list
    - **Property 4: Unknown artifact IDs appear in missing list**
    - **Validates: Requirements 2.2**
    - File: `server/src/studio/v2/sync/__tests__/ArtifactTransferManager.pbt.test.ts`
    - Use `fc.uuid()` to generate IDs not present in store; assert each appears in `missing` and not in `artifacts`.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 4: Unknown artifact IDs appear in missing list`

  - [ ] 5.4 Write property test P5 — payload cap is enforced
    - **Property 5: Payload cap is enforced**
    - **Validates: Requirements 2.5**
    - File: `server/src/studio/v2/sync/__tests__/ArtifactTransferManager.pbt.test.ts`
    - Generate content blobs whose combined size exceeds 1 MB; assert `payloadExceeded === true`.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 5: Payload cap is enforced`

- [ ] 6. Checkpoint — all unit and SyncValidator tests passing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Unit tests for `ProjectSyncManager`
  - [ ] 7.1 Write unit tests for `ProjectSyncManager`
    - File: `server/src/studio/v2/sync/__tests__/ProjectSyncManager.unit.test.ts`
    - Cover: `getProjectSnapshot` for empty pipeline; `processSyncRequest` with zero changes returns `no_changes`; `processSyncRequest` with valid changes returns `applied`; `processSyncRequest` with a conflict returns `conflict`; `processSyncRequest` with mixed changes (some conflict, some clean); `getSyncStatus` returns sentinel `0.0.0` when no snapshot exists; `validateOnly` does not mutate store.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1_

  - [ ] 7.2 Write property test P1 — snapshot artifacts match store contents
    - **Property 1: Snapshot artifacts match store contents**
    - **Validates: Requirements 1.1, 1.4**
    - File: `server/src/studio/v2/sync/__tests__/ProjectSyncManager.pbt.test.ts`
    - Use `fc.array(fc.record({...}))` shaped like `PipelineArtifact`; seed the store; call `getProjectSnapshot`; assert `artifacts.length === stored.length` and every field matches.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 1: Snapshot artifacts match store contents`

  - [ ] 7.3 Write property test P2 — version changes after mutation
    - **Property 2: Version changes after a mutation**
    - **Validates: Requirements 1.3, 3.5**
    - File: `server/src/studio/v2/sync/__tests__/ProjectSyncManager.pbt.test.ts`
    - Snapshot once; add/edit an artifact; snapshot again; assert `v1 !== v2`.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 2: Version changes after mutation`

  - [ ] 7.4 Write property test P6 — valid non-conflicting changes are applied
    - **Property 6: Valid non-conflicting changes are applied**
    - **Validates: Requirements 3.2**
    - File: `server/src/studio/v2/sync/__tests__/ProjectSyncManager.pbt.test.ts`
    - Generate valid `SyncChange[]` where `timestamp > artifact.createdAt`; assert `status === "applied"` and `appliedChanges.length === changes.length`.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 6: Valid non-conflicting changes are applied`

  - [ ] 7.5 Write property test P7 — conflicting changes produce conflict result
    - **Property 7: Conflicting changes produce conflict result**
    - **Validates: Requirements 3.3**
    - File: `server/src/studio/v2/sync/__tests__/ProjectSyncManager.pbt.test.ts`
    - Generate `update`/`delete` change where `timestamp < artifact.createdAt`; assert `status === "conflict"` and change ID appears in `conflicts`.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 7: Conflicting changes produce conflict result`

  - [ ] 7.6 Write property test P8 — validation is pure (no mutation)
    - **Property 8: Validation is a pure check — no state mutation**
    - **Validates: Requirements 4.1**
    - File: `server/src/studio/v2/sync/__tests__/ProjectSyncManager.pbt.test.ts`
    - Record artifact count before `validateOnly`; call with arbitrary changes; assert count unchanged.
    - Tag: `// Feature: project-sync-artifact-transfer, Property 8: Validation is a pure check — no state mutation`

- [ ] 8. Integration tests for REST endpoints
  - [ ] 8.1 Write integration tests for `POST /api/studio/sync/project`
    - File: `server/src/routes/__tests__/studioSync.integration.test.ts`
    - Use `supertest` against an in-process Express app constructed via `createStudioRouter()`.
    - Cover: valid `projectId` returns 200 with `ProjectSnapshot`; missing `projectId` returns 400; project not found returns 404.
    - _Requirements: 5.1, 5.4_

  - [ ] 8.2 Write integration tests for `POST /api/studio/sync/artifacts`
    - File: `server/src/routes/__tests__/studioSync.integration.test.ts` (same file)
    - Cover: valid artifact IDs return 200 with transfer result; empty array returns 400; oversized payload returns 413 with partial transfer data; unknown IDs appear in `missing`.
    - _Requirements: 5.2, 5.5, 2.2, 2.5_

  - [ ] 8.3 Write integration tests for `GET /api/studio/sync/status`
    - File: `server/src/routes/__tests__/studioSync.integration.test.ts`
    - Cover: without `projectId` returns status with `projectId: null`; with valid `projectId` returns matching status object.
    - _Requirements: 5.3_

  - [ ] 8.4 Write integration tests for protocol handler dispatch
    - File: `server/src/routes/__tests__/studioSync.integration.test.ts`
    - POST `GET_PROJECT`, `GET_ARTIFACTS`, `SYNC_REQUEST`, `VALIDATE` messages to `/api/studio/protocol/message`; assert each returns a protocol response (not an error) and the response payload matches expected shape.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 9. Checkpoint — all tests passing
  - Ensure all unit, PBT, smoke, and integration tests pass. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Server-side modules (`SyncTypes.ts`, `ProjectSyncManager`, `ArtifactTransferManager`, `SyncValidator`, `index.ts`, and `studio.ts` registration) are already complete — tasks 1.x verify them but do not rewrite them
- The two frontend gaps (tasks 2.x and 3.x) are the only source-code changes outside the test suite
- All property-based tests use [fast-check](https://github.com/dubzzz/fast-check) with a minimum of 100 iterations
- PBT tag format: `// Feature: project-sync-artifact-transfer, Property N: <title>`
- Property tests P1–P12 cover server-side logic; P13 covers the React `LogRow` component
- Integration tests use `supertest` against a real in-process Express router — no external services required

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "4.1", "5.1", "7.1"] },
    {
      "id": 2,
      "tasks": [
        "3.2",
        "4.2",
        "4.3",
        "4.4",
        "4.5",
        "5.2",
        "5.3",
        "5.4",
        "7.2",
        "7.3",
        "7.4",
        "7.5",
        "7.6"
      ]
    },
    { "id": 3, "tasks": ["8.1", "8.2", "8.3", "8.4"] }
  ]
}
```
