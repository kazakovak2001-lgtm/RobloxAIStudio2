# Requirements Document

## Introduction

Sprint v1.6.2 extends the existing Studio Plugin Communication Protocol (v1.6.1) with a Project Synchronization and Artifact Transfer Layer. This module enables the DevKit server to synchronize project state with connected Roblox Studio plugins, detect conflicts between local and remote states, validate incoming changes, and transfer pipeline artifacts to and from Studio. The implementation extends the existing ProtocolDispatcher, ArtifactStore, and frontend ProtocolMonitor without creating new pages or workspaces.

## Glossary

- **Sync_Module**: The server-side synchronization module located at `server/src/studio/v2/sync/` responsible for coordinating project state and artifact transfer operations.
- **ProjectSyncManager**: The service class that handles sync requests, compares project state between DevKit and Studio, and detects conflicts.
- **ArtifactTransferManager**: The service class that registers pipeline artifacts for transfer and retrieves them for delivery to Studio plugins.
- **SyncValidator**: The service class that validates incoming sync changes and artifact integrity before applying them.
- **ProjectSnapshot**: A data structure representing the complete state of a project at a point in time, including artifact references, timestamps, and version identifiers.
- **SyncChange**: A data structure describing a single change to project state, including the change type, affected artifact, and content delta.
- **SyncResult**: A data structure representing the outcome of a sync operation, including applied changes, conflicts detected, and validation errors.
- **ProtocolDispatcher**: The existing message router (`server/src/studio/v2/protocol/ProtocolDispatcher.ts`) that routes incoming protocol messages to registered handlers.
- **ArtifactStore**: The existing pipeline artifact storage (`server/src/pipeline/v2/ArtifactStore.ts`) that holds outputs from pipeline stages.
- **Protocol_Monitor**: The existing frontend component (`src/features/workspace/components/ProtocolMonitor.tsx`) that displays protocol activity and stats.
- **Studio_API_Client**: The existing frontend API module (`src/services/studioBridgeApi.ts`) that provides functions for communicating with the Studio Bridge backend.

## Requirements

### Requirement 1: Project Snapshot Generation

**User Story:** As a Studio plugin developer, I want to request the current project state from the DevKit server, so that the plugin can compare local state and determine what needs synchronizing.

#### Acceptance Criteria

1. WHEN a GET_PROJECT message is received by the ProtocolDispatcher, THE Sync_Module SHALL generate a ProjectSnapshot containing all artifact references, their types, timestamps, sizes, and validation statuses for the requested project.
2. WHEN a GET_PROJECT message contains an invalid or missing project identifier, THE Sync_Module SHALL return an error response with a descriptive message indicating the project was not found.
3. THE ProjectSnapshot SHALL include a version identifier that changes whenever any artifact in the project is added, modified, or removed.
4. WHEN a GET_PROJECT message is received for a project with zero artifacts, THE Sync_Module SHALL return a valid ProjectSnapshot with an empty artifact list and a base version identifier.

### Requirement 2: Artifact Retrieval and Transfer

**User Story:** As a Studio plugin developer, I want to retrieve specific artifacts from the DevKit server, so that I can load generated Lua scripts, asset plans, and manifests into Studio.

#### Acceptance Criteria

1. WHEN a GET_ARTIFACTS message is received by the ProtocolDispatcher, THE ArtifactTransferManager SHALL retrieve the requested artifacts from the ArtifactStore and return their content in the response payload.
2. WHEN a GET_ARTIFACTS message requests an artifact that does not exist, THE ArtifactTransferManager SHALL omit that artifact from the response and include its identifier in a list of missing artifacts.
3. WHEN a GET_ARTIFACTS message requests multiple artifacts, THE ArtifactTransferManager SHALL return all found artifacts in a single response payload.
4. THE ArtifactTransferManager SHALL include metadata for each transferred artifact: identifier, type, name, size in bytes, creation timestamp, and validation status.
5. IF the total response payload exceeds 1 MB, THEN THE ArtifactTransferManager SHALL return an error response indicating the payload size limit was exceeded and suggest requesting fewer artifacts.

### Requirement 3: Sync Request Processing

**User Story:** As a Studio plugin developer, I want to submit changes from Studio to the DevKit server, so that edits made in-engine are reflected in the project pipeline.

#### Acceptance Criteria

1. WHEN a SYNC_REQUEST message is received by the ProtocolDispatcher, THE ProjectSyncManager SHALL compare the submitted changes against the current project state.
2. WHEN all submitted changes are compatible with the current project state, THE ProjectSyncManager SHALL apply the changes and return a SyncResult with status "applied" and a list of applied changes.
3. WHEN one or more submitted changes conflict with the current project state, THE ProjectSyncManager SHALL return a SyncResult with status "conflict" containing a list of conflicting changes and their conflict reasons.
4. WHEN a SYNC_REQUEST message contains zero changes, THE ProjectSyncManager SHALL return a SyncResult with status "no_changes" and the current project version.
5. THE ProjectSyncManager SHALL update the project version identifier after applying changes successfully.

### Requirement 4: Change Validation

**User Story:** As a DevKit maintainer, I want incoming sync changes validated before they are applied, so that invalid data does not corrupt the project state.

#### Acceptance Criteria

1. WHEN a VALIDATE message is received by the ProtocolDispatcher, THE SyncValidator SHALL validate the provided changes without applying them and return a validation result.
2. THE SyncValidator SHALL verify that each SyncChange references a valid artifact type from the supported set (json, lua, markdown, text, manifest, ui-layout, asset-plan).
3. THE SyncValidator SHALL verify that each SyncChange contains non-empty content when the change type is "create" or "update".
4. THE SyncValidator SHALL verify that each SyncChange references an existing artifact identifier when the change type is "update" or "delete".
5. IF any change fails validation, THEN THE SyncValidator SHALL return a validation result listing all failing changes with specific error descriptions.
6. WHEN all changes pass validation, THE SyncValidator SHALL return a validation result with status "valid" and the count of validated changes.

### Requirement 5: Backend REST API Endpoints

**User Story:** As a frontend developer, I want REST API endpoints for sync operations, so that the web dashboard can initiate and monitor synchronization independent of the protocol message layer.

#### Acceptance Criteria

1. THE Sync_Module SHALL expose a POST /api/studio/sync/project endpoint that accepts a project identifier and returns the current ProjectSnapshot.
2. THE Sync_Module SHALL expose a POST /api/studio/sync/artifacts endpoint that accepts a list of artifact identifiers and returns the corresponding artifact content and metadata.
3. THE Sync_Module SHALL expose a GET /api/studio/sync/status endpoint that returns the current sync state including last sync timestamp, pending changes count, and conflict count.
4. WHEN the POST /api/studio/sync/project endpoint receives a request without a valid project identifier, THE Sync_Module SHALL return HTTP 400 with a descriptive error message.
5. WHEN the POST /api/studio/sync/artifacts endpoint receives an empty artifact list, THE Sync_Module SHALL return HTTP 400 with a descriptive error message.

### Requirement 6: Frontend API Client Extensions

**User Story:** As a frontend developer, I want TypeScript API client functions for the sync endpoints, so that the UI can call sync operations using the established pattern.

#### Acceptance Criteria

1. THE Studio_API_Client SHALL provide a `getSyncStatus` function that calls GET /api/studio/sync/status and returns typed sync state data.
2. THE Studio_API_Client SHALL provide a `requestProjectSync` function that calls POST /api/studio/sync/project with a project identifier and returns a typed ProjectSnapshot.
3. THE Studio_API_Client SHALL provide a `requestArtifacts` function that calls POST /api/studio/sync/artifacts with artifact identifiers and returns typed artifact data.
4. THE Studio_API_Client SHALL follow the existing error-handling pattern: returning `{ success: boolean; data?: T; error?: string }` for all sync functions.
5. THE Studio_API_Client SHALL export TypeScript interfaces for SyncStatus, ProjectSnapshot, SyncChange, and ArtifactTransferResult.

### Requirement 7: Frontend Sync Monitoring

**User Story:** As a developer using the DevKit dashboard, I want to see sync activity in the existing Protocol Monitor panel, so that I can observe synchronization operations alongside other protocol messages.

#### Acceptance Criteria

1. THE Protocol_Monitor SHALL display sync-related messages (SYNC_REQUEST, SYNC_RESPONSE, GET_PROJECT, GET_ARTIFACTS, VALIDATE) with distinct visual indicators differentiating them from connection management messages.
2. THE Protocol_Monitor SHALL display a sync status summary section showing the last sync timestamp, number of pending changes, and number of conflicts.
3. WHEN a sync conflict is detected, THE Protocol_Monitor SHALL display a warning indicator in the sync status section.
4. THE Protocol_Monitor SHALL update sync status information on the same polling interval used for protocol log updates (5 seconds).

### Requirement 8: Type Definitions Module

**User Story:** As a backend developer, I want centralized TypeScript type definitions for sync operations, so that all sync modules share consistent interfaces.

#### Acceptance Criteria

1. THE Sync_Module SHALL define a SyncTypes module at `server/src/studio/v2/sync/SyncTypes.ts` exporting all shared type definitions.
2. THE SyncTypes module SHALL export a ProjectSnapshot interface including: projectId, version, artifacts array, generatedAt timestamp, and artifactCount.
3. THE SyncTypes module SHALL export a SyncChange interface including: changeId, artifactId, artifactType, changeType (create, update, delete), content, and timestamp.
4. THE SyncTypes module SHALL export a SyncResult interface including: status (applied, conflict, no_changes, error), appliedChanges array, conflicts array, newVersion, and timestamp.
5. THE SyncTypes module SHALL export a SyncConflict interface including: changeId, artifactId, reason, localVersion, and remoteVersion.

### Requirement 9: Protocol Handler Registration

**User Story:** As a backend developer, I want the sync handlers registered with the existing ProtocolDispatcher, so that sync messages are routed using the established protocol infrastructure.

#### Acceptance Criteria

1. WHEN the Sync_Module is initialized, THE Sync_Module SHALL register handlers for GET_PROJECT, GET_ARTIFACTS, SYNC_REQUEST, and VALIDATE message types with the ProtocolDispatcher.
2. THE registered handlers SHALL use the existing `ProtocolDispatcher.register()` method and follow the `MessageHandler` type signature.
3. THE registered handlers SHALL delegate processing to the appropriate sync service (ProjectSyncManager, ArtifactTransferManager, or SyncValidator).
4. IF a handler encounters an unrecoverable error, THEN THE handler SHALL return a protocol error response using the existing `createResponse` utility with status "error" and a descriptive error message.
