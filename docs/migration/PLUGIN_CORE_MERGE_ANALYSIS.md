# PLUGIN CORE MERGE ANALYSIS
**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Phase**: 2.5.D.1 - Plugin Core Merge Review

---

## EXECUTIVE SUMMARY

This document provides a forensic analysis of unresolved merge conflicts in the plugin merge execution. Each file is analyzed for purpose, implementation differences, duplicated functionality, dependencies, and merge strategy.

**Analysis Status**: ✅ COMPLETE
- **Files Analyzed**: 6
- **SAFE Conflicts**: 0
- **MANUAL Conflicts**: 5
- **REMOVE Conflicts**: 1
- **CRITICAL Issues**: 1 (plugin.lua corruption)

---

## 1. CONNECTIONMANAGER.LUA

### 1.1 Purpose

Manages connection lifecycle with heartbeat and auto-reconnect functionality.

### 1.2 Current Implementation (ConnectionManager.lua)

**Location**: `studio-plugin/src/services/ConnectionManager.lua`
**Lines**: 88
**Dependencies**:
- `Config` (from `script.Parent.Config` - INCORRECT PATH)
- `connector` (StudioConnector)
- `errorReporter`

**Key Features**:
- Status tracking ("disconnected", "connecting", "connected", "failed", "reconnecting")
- Heartbeat with configurable interval
- Auto-reconnect with exponential backoff
- Error reporting via errorReporter
- Uses StudioConnector for protocol-based communication

**Constructor**:
```lua
function ConnectionManager.new(connector, errorReporter)
```

**Methods**:
- `connect()` - Connect via connector
- `disconnect()` - Disconnect and stop heartbeat
- `getStatus()` - Return current status
- `_startHeartbeat()` - Start heartbeat thread
- `_stopHeartbeat()` - Stop heartbeat thread
- `_attemptReconnect()` - Attempt reconnection with backoff
- `destroy()` - Cleanup

### 1.3 Legacy Implementation (ConnectionManager_legacy.lua)

**Location**: `studio-plugin/src/services/ConnectionManager_legacy.lua`
**Lines**: 113
**Dependencies**:
- `apiClient` (ApiClient)
- `events` (Events system)

**Key Features**:
- Connection state tracking (boolean)
- Project ID tracking
- Heartbeat with fixed 15s interval
- Auto-reconnect with exponential backoff
- Event firing for all state changes
- Session management (sessionId, clientId)
- Uses ApiClient for direct REST API calls

**Constructor**:
```lua
function ConnectionManager.new(apiClient, events)
```

**Methods**:
- `isConnected()` - Return connection state
- `getProjectId()` - Return current project ID
- `connect(projectId)` - Connect with project ID
- `disconnect()` - Disconnect and fire event
- `_startHeartbeat()` - Start heartbeat thread
- `_stopHeartbeat()` - Stop heartbeat thread
- `_attemptReconnect()` - Attempt reconnection
- `destroy()` - Cleanup

### 1.4 Differences

| Aspect | Current | Legacy |
|--------|---------|--------|
| **Communication Layer** | StudioConnector (protocol-based) | ApiClient (REST-based) |
| **Status Tracking** | String status (5 states) | Boolean + projectId |
| **Event System** | None (uses errorReporter) | Events system (5 events) |
| **Configuration** | Config.HEARTBEAT_INTERVAL | Hardcoded 15s |
| **Reconnect Config** | Config.RECONNECT_MAX_ATTEMPTS | Hardcoded 5 |
| **Session Management** | Handled by StudioConnector | Managed locally (sessionId, clientId) |
| **Project ID** | Not tracked | Tracked and passed to connect() |
| **Error Reporting** | errorReporter.report() | events.fire("CONNECTION_FAILED") |
| **Dependency Path** | script.Parent.Config (INCORRECT) | None |

### 1.5 Duplicated Functionality

**Duplicated**:
- Heartbeat mechanism
- Auto-reconnect with exponential backoff
- Connection lifecycle management
- Status tracking

**Unique to Current**:
- Protocol-based communication via StudioConnector
- Config-based settings
- ErrorReporter integration

**Unique to Legacy**:
- Event system integration
- Project ID tracking
- Session management
- Direct REST API calls

### 1.6 Dependencies

**Current Dependencies**:
- `Config` - **BROKEN PATH** (script.Parent.Config should be script.Parent.core.Config)
- `connector` - StudioConnector instance
- `errorReporter` - ErrorReporter instance

**Legacy Dependencies**:
- `apiClient` - ApiClient instance
- `events` - Events instance

### 1.7 Recommended Final Version

**Strategy**: MERGE with MANUAL INTEGRATION

**Keep from Current**:
- Protocol-based communication (StudioConnector)
- Config-based settings (HEARTBEAT_INTERVAL, RECONNECT_MAX_ATTEMPTS)
- ErrorReporter integration
- String-based status tracking

**Add from Legacy**:
- Event system integration (STUDIO_CONNECTED, STUDIO_DISCONNECTED, RECONNECTING, RECONNECT_FAILED)
- Project ID tracking
- Session information display

**Remove**:
- Direct ApiClient dependency (deprecated)
- Hardcoded values

### 1.8 Merge Strategy

**Classification**: MANUAL

**Steps**:
1. Fix Config require path: `script.Parent.core.Config`
2. Add events parameter to constructor
3. Add projectId tracking
4. Add event firing at appropriate points:
   - STUDIO_CONNECTED on successful connect
   - STUDIO_DISCONNECTED on disconnect
   - RECONNECTING on reconnect attempt
   - RECONNECT_FAILED on max attempts
5. Keep StudioConnector for communication
6. Keep Config-based settings
7. Keep ErrorReporter for errors
8. Add getProjectId() method
9. Add isConnected() method (alias for getStatus() == "connected")

**Risk**: MEDIUM
- Requires careful event integration
- Need to ensure StudioConnector provides session info

---

## 2. SYNCMANAGER.LUA

### 2.1 Purpose

Synchronizes artifacts from backend into Roblox Studio hierarchy.

### 2.2 Current Implementation (SyncManager.lua)

**Location**: `studio-plugin/src/services/SyncManager.lua`
**Lines**: 74
**Dependencies**:
- `Config` (from `script.Parent.Config` - INCORRECT PATH)
- `connector` (StudioConnector)
- `artifactLoader` (ArtifactLoader)
- `errorReporter` (ErrorReporter)

**Key Features**:
- Protocol-based artifact sync via StudioConnector
- Two-step sync (GET_PROJECT, GET_ARTIFACTS)
- ArtifactLoader for instance creation
- Error reporting via errorReporter
- Sync time and count tracking

**Constructor**:
```lua
function SyncManager.new(connector, artifactLoader, errorReporter)
```

**Methods**:
- `syncProject(projectId)` - Sync project via protocol
- `getLastSyncTime()` - Return last sync timestamp
- `getSyncCount()` - Return sync count

### 2.3 Legacy Implementation (SyncManager_legacy.lua)

**Location**: `studio-plugin/src/services/SyncManager_legacy.lua`
**Lines**: 108
**Dependencies**:
- `ServerScriptService` (Roblox service)
- `ReplicatedStorage` (Roblox service)
- `apiClient` (ApiClient)
- `events` (Events system)

**Key Features**:
- Direct API calls via ApiClient
- Event-based sync notifications
- Built-in script application logic
- Stage-based targeting (ServerScriptService vs ReplicatedStorage)
- Synced artifacts tracking
- Event firing for sync lifecycle

**Constructor**:
```lua
function SyncManager.new(apiClient, events)
```

**Methods**:
- `getLastSyncTime()` - Return last sync timestamp
- `getSyncedCount()` - Return synced artifact count
- `syncProject(projectId)` - Sync project via API
- `_applyScript(artifact)` - Create/update script in Studio
- `destroy()` - Cleanup

### 2.4 Differences

| Aspect | Current | Legacy |
|--------|---------|--------|
| **Communication Layer** | StudioConnector (protocol-based) | ApiClient (REST-based) |
| **Artifact Loading** | ArtifactLoader (separate) | Built-in _applyScript() |
| **Event System** | None | Events system (3 events) |
| **Target Location** | Not specified | Stage-based (ServerScriptService/ReplicatedStorage) |
| **Sync Tracking** | Time + count | Time + syncedArtifacts array |
| **Error Reporting** | errorReporter.report() | events.fire("PROJECT_SYNC_FAILED") |
| **Dependency Path** | script.Parent.Config (INCORRECT) | None |
| **Script Logic** | Delegated to ArtifactLoader | Built-in _applyScript() |

### 2.5 Duplicated Functionality

**Duplicated**:
- Project sync orchestration
- Sync time tracking
- Sync count tracking

**Unique to Current**:
- Protocol-based communication
- ArtifactLoader delegation
- Two-step protocol sync

**Unique to Legacy**:
- Event system integration
- Built-in script application
- Stage-based targeting
- Synced artifacts array tracking

### 2.6 Dependencies

**Current Dependencies**:
- `Config` - **BROKEN PATH** (script.Parent.Config should be script.Parent.core.Config)
- `connector` - StudioConnector instance
- `artifactLoader` - ArtifactLoader instance
- `errorReporter` - ErrorReporter instance

**Legacy Dependencies**:
- `ServerScriptService` - Roblox service
- `ReplicatedStorage` - Roblox service
- `apiClient` - ApiClient instance
- `events` - Events instance

### 2.7 Recommended Final Version

**Strategy**: MERGE with MANUAL INTEGRATION

**Keep from Current**:
- Protocol-based communication (StudioConnector)
- ArtifactLoader delegation (cleaner separation)
- Config-based settings
- ErrorReporter integration

**Add from Legacy**:
- Event system integration (PROJECT_SYNC_STARTED, PROJECT_SYNC_COMPLETED, PROJECT_SYNC_FAILED)
- Stage-based targeting configuration
- Synced artifacts tracking (optional)

**Remove**:
- Direct ApiClient dependency (deprecated)
- Built-in _applyScript() (use ArtifactLoader)
- Hardcoded service references

### 2.8 Merge Strategy

**Classification**: MANUAL

**Steps**:
1. Fix Config require path: `script.Parent.core.Config`
2. Add events parameter to constructor
3. Add event firing at appropriate points:
   - PROJECT_SYNC_STARTED on sync start
   - PROJECT_SYNC_COMPLETED on sync success
   - PROJECT_SYNC_FAILED on sync failure
4. Keep ArtifactLoader for script application
5. Add stage-based targeting configuration to Config or constructor
6. Keep protocol-based sync (GET_PROJECT, GET_ARTIFACTS)
7. Keep ErrorReporter for errors
8. Optionally add syncedArtifacts tracking

**Risk**: MEDIUM
- Requires event integration
- Need to ensure ArtifactLoader handles stage-based targeting

---

## 3. COMMANDPANEL.LUA

### 3.1 Purpose

Minimal plugin UI for Studio integration.

### 3.2 Current Implementation (CommandPanel.lua)

**Location**: `studio-plugin/src/ui/CommandPanel.lua`
**Lines**: 118
**Dependencies**:
- `plugin` (Roblox plugin object)
- `connManager` (ConnectionManager)
- `syncManager` (SyncManager)
- `errors` (ErrorReporter)

**Key Features**:
- Dock widget UI (280x350)
- 4 buttons: Connect, Generate, Sync Project, Show Errors
- Status label
- Minimal styling
- No event binding
- No session info
- No sync info

**Constructor**:
```lua
function CommandPanel.new(plugin, connManager, syncManager, errors)
```

**Methods**:
- `_build()` - Build UI
- `_onConnect()` - Handle connect button
- `_onGenerate()` - Handle generate button (stub)
- `_onSync()` - Handle sync button
- `_onShowErrors()` - Handle show errors button
- `show()`, `hide()`, `toggle()` - Widget visibility
- `destroy()` - Cleanup
- `_label()` - Create label helper
- `_btn()` - Create button helper

### 3.3 Legacy Implementation (UI_legacy.lua)

**Location**: `studio-plugin/src/ui/UI_legacy.lua`
**Lines**: 187
**Dependencies**:
- `plugin` (Roblox plugin object)
- `connectionManager` (ConnectionManager)
- `syncManager` (SyncManager)
- `events` (Events system)

**Key Features**:
- Dock widget UI (300x400)
- 3 buttons: Connect, Sync Project, Disconnect
- Status label with color coding
- Session info label
- Last sync info label
- Event binding (5 events)
- Dynamic status updates
- More complete styling

**Constructor**:
```lua
function UI.new(plugin, connectionManager, syncManager, events)
```

**Methods**:
- `_create()` - Create UI
- `_bindEvents()` - Bind event handlers
- `_handleConnect()` - Handle connect button
- `_handleSync()` - Handle sync button
- `_handleDisconnect()` - Handle disconnect button
- `_updateStatus()` - Update status label
- `_addLabel()` - Create label helper
- `_addButton()` - Create button helper
- `show()`, `hide()`, `toggle()` - Widget visibility
- `destroy()` - Cleanup

### 3.4 Differences

| Aspect | Current | Legacy |
|--------|---------|--------|
| **Widget Size** | 280x350 | 300x400 |
| **Buttons** | 4 (Connect, Generate, Sync, Errors) | 3 (Connect, Sync, Disconnect) |
| **Status Display** | Simple label | Color-coded label |
| **Session Info** | None | Session label |
| **Sync Info** | None | Last sync label |
| **Event Binding** | None | 5 events bound |
| **Status Updates** | Manual | Automatic via events |
| **Error Display** | Print to console | Status label |
| **Dependencies** | ErrorReporter | Events system |
| **Generate Button** | Yes (stub) | No |
| **Disconnect Button** | No | Yes |

### 3.5 Duplicated Functionality

**Duplicated**:
- Dock widget creation
- Connect button
- Sync button
- Status label
- Widget visibility control
- Helper methods for UI elements

**Unique to Current**:
- Generate button (stub)
- Show Errors button
- ErrorReporter integration
- Smaller widget size

**Unique to Legacy**:
- Disconnect button
- Session info display
- Sync info display
- Event system integration
- Automatic status updates
- Color-coded status

### 3.6 Dependencies

**Current Dependencies**:
- `plugin` - Roblox plugin object
- `connManager` - ConnectionManager instance
- `syncManager` - SyncManager instance
- `errors` - ErrorReporter instance

**Legacy Dependencies**:
- `plugin` - Roblox plugin object
- `connectionManager` - ConnectionManager instance
- `syncManager` - SyncManager instance
- `events` - Events instance

### 3.7 Recommended Final Version

**Strategy**: MERGE with MANUAL INTEGRATION

**Keep from Current**:
- Generate button (keep as stub for future)
- Show Errors button (useful for debugging)
- ErrorReporter integration (for error display)
- Smaller widget size (more compact)

**Add from Legacy**:
- Event system integration
- Session info display
- Sync info display
- Disconnect button
- Color-coded status
- Automatic status updates

**Remove**:
- Manual status updates (replace with event-based)
- Console error printing (use status label)

### 3.8 Merge Strategy

**Classification**: MANUAL

**Steps**:
1. Add events parameter to constructor
2. Add event binding (_bindEvents method)
3. Add session info label
4. Add sync info label
5. Add disconnect button
6. Update status label to support color coding
7. Bind events for automatic updates:
   - STUDIO_CONNECTED - Update status and session
   - STUDIO_DISCONNECTED - Update status and session
   - PROJECT_SYNC_COMPLETED - Update sync info
   - RECONNECTING - Update status
   - CONNECTION_FAILED - Update status
8. Keep Generate and Show Errors buttons
9. Update error display to use status label instead of console
10. Optionally adjust widget size

**Risk**: MEDIUM
- Requires event integration
- Need to ensure ConnectionManager and SyncManager fire events

---

## 4. PLUGIN.LUA

### 4.1 Purpose

Entry point for the Roblox Studio plugin. Initializes all modules and sets up the toolbar.

### 4.2 Current Implementation (plugin.lua)

**Location**: `studio-plugin/plugin.lua`
**Lines**: 105
**Status**: **CORRUPTED**

**Issues Identified**:
- Lines 35-41 are garbled/corrupted
- References to undefined variables (studeoConnectorntsStud, ApiClient, BACKEND_URL, API_KEY)
- Syntax errors

**Corrupted Section**:
```lua
local studeoConnectorntsStud oEotnecsor.new(
local api = ApiClient.new(BACKEND_URL, API_KEY)studoConnector
local connectionManager = ConnectionstudnoConnectorager.new)
local artifactLoader = ArtifactLoader.new()
local errorReporter = ErrorReporter.new()
local runtimeValidator = RuntimeValidator.new((api, events)
local syncManager = SyncManager.new(api, events)
```

**Expected Section**:
```lua
local events = Events.new()
local studioConnector = StudioConnector.new()
local connectionManager = ConnectionManager.new(studioConnector, events)
local syncManager = SyncManager.new(studioConnector, events)
local artifactLoader = ArtifactLoader.new()
local errorReporter = ErrorReporter.new()
local runtimeValidator = RuntimeValidator.new()
```

### 4.3 Dependencies

**Current Dependencies**:
- `Config` (from `script.Parent.src.core.Config`)
- `Events` (from `script.Parent.src.core.Events`)
- `StudioConnector` (from `script.Parent.src.services.StudioConnector`)
- `ConnectionManager` (from `script.Parent.src.services.ConnectionManager`)
- `SyncManager` (from `script.Parent.src.services.SyncManager`)
- `CommandPanel` (from `script.Parent.src.ui.CommandPanel`)
- `ArtifactLoader` (from `script.Parent.src.utils.ArtifactLoader`)
- `ErrorReporter` (from `script.Parent.src.utils.ErrorReporter`)
- `RuntimeValidator` (from `script.Parent.src.utils.RuntimeValidator`)

### 4.4 Recommended Final Version

**Strategy**: REWRITE

**Steps**:
1. Fix corrupted initialization section
2. Update constructor calls to match new signatures:
   - ConnectionManager.new(studioConnector, events)
   - SyncManager.new(studioConnector, artifactLoader, errorReporter)
   - CommandPanel.new(plugin, connectionManager, syncManager, events, artifactLoader, errorReporter)
3. Add events parameter to ConnectionManager and SyncManager
4. Remove unused runtimeValidator (not used in current code)
5. Keep event logging section
6. Keep cleanup section

### 4.5 Merge Strategy

**Classification**: MANUAL - CRITICAL

**Risk**: HIGH
- File is corrupted and cannot load
- Must be fixed before any testing
- Constructor signatures may need adjustment

---

## 5. CONFIG.LUA

### 5.1 Purpose

Plugin configuration constants.

### 5.2 Current Implementation (Config.lua)

**Location**: `studio-plugin/src/core/Config.lua`
**Lines**: 17
**Status**: NO CONFLICT

**Content**:
```lua
local Config = {}

Config.BACKEND_URL = "http://localhost:5000"
Config.API_KEY = ""
Config.PROTOCOL_VERSION = "1.0.0"
Config.PLUGIN_VERSION = "1.7.0"
Config.HEARTBEAT_INTERVAL = 15
Config.RECONNECT_MAX_ATTEMPTS = 5
Config.SESSION_TIMEOUT = 60
Config.PAYLOAD_MAX_SIZE = 1048576

return Config
```

### 5.3 Analysis

**Status**: SAFE
- No conflicts
- No legacy version
- Already in correct location
- Contains all necessary configuration

### 5.4 Recommended Final Version

**Strategy**: KEEP AS-IS

**Optional Enhancements**:
- Add ENABLE_LEGACY_API flag (false by default)
- Add STAGE_TARGETING configuration
- Add UI_SIZE configuration

### 5.5 Merge Strategy

**Classification**: SAFE

**Risk**: LOW
- No changes required
- Can be used as-is

---

## 6. EVENTS.LUA

### 6.1 Purpose

Event system for plugin communication.

### 6.2 Current Implementation (Events.lua)

**Location**: `studio-plugin/src/core/Events.lua`
**Lines**: 52
**Status**: NO CONFLICT

**Content**:
- Event registration and firing
- Simple pub/sub pattern

### 6.3 Analysis

**Status**: SAFE
- No conflicts
- No legacy version
- Already in correct location
- Required by legacy implementations

### 6.4 Recommended Final Version

**Strategy**: KEEP AS-IS

### 6.5 Merge Strategy

**Classification**: SAFE

**Risk**: LOW
- No changes required

---

## 7. STUDIOCONNECTOR.LUA

### 7.1 Purpose

Protocol-level HTTP communication with backend.

### 7.2 Current Implementation (StudioConnector.lua)

**Location**: `studio-plugin/src/services/StudioConnector.lua`
**Lines**: 150
**Status**: NO CONFLICT

**Content**:
- Protocol-based messaging (HELLO, PING, PONG, STATUS, etc.)
- Session management
- Message ID tracking

### 7.3 Analysis

**Status**: SAFE
- No conflicts
- No legacy version (ApiClient is legacy)
- Already in correct location
- Required by current implementations

### 7.4 Recommended Final Version

**Strategy**: KEEP AS-IS

### 7.5 Merge Strategy

**Classification**: SAFE

**Risk**: LOW
- No changes required

---

## 8. ARTIFACTLOADER.LUA

### 8.1 Purpose

Instance creation from artifacts.

### 8.2 Current Implementation (ArtifactLoader.lua)

**Location**: `studio-plugin/src/utils/ArtifactLoader.lua`
**Lines**: 95
**Status**: NO CONFLICT

**Content**:
- Artifact loading logic
- Instance creation
- Validation

### 8.3 Analysis

**Status**: SAFE
- No conflicts
- No legacy version
- Already in correct location
- Required by current implementations

### 8.4 Recommended Final Version

**Strategy**: KEEP AS-IS

**Optional Enhancements**:
- Add stage-based targeting configuration
- Support for UI_GENERATION stage targeting

### 8.5 Merge Strategy

**Classification**: SAFE

**Risk**: LOW
- No changes required
- Optional enhancements for stage targeting

---

## 9. ERRORREPORTER.LUA

### 9.1 Purpose

Centralized error handling.

### 9.2 Current Implementation (ErrorReporter.lua)

**Location**: `studio-plugin/src/utils/ErrorReporter.lua`
**Lines**: 40
**Status**: NO CONFLICT

**Content**:
- Error reporting
- Error storage
- Error retrieval

### 9.3 Analysis

**Status**: SAFE
- No conflicts
- No legacy version
- Already in correct location
- Required by current implementations

### 9.4 Recommended Final Version

**Strategy**: KEEP AS-IS

### 9.5 Merge Strategy

**Classification**: SAFE

**Risk**: LOW
- No changes required

---

## 10. RUNTIMEVALIDATOR.LUA

### 10.1 Purpose

Runtime validation.

### 10.2 Current Implementation (RuntimeValidator.lua)

**Location**: `studio-plugin/src/utils/RuntimeValidator.lua`
**Lines**: 120
**Status**: NO CONFLICT

**Content**:
- Runtime validation logic
- Artifact validation

### 10.3 Analysis

**Status**: SAFE
- No conflicts
- No legacy version
- Already in correct location
- Not currently used in plugin.lua

### 10.4 Recommended Final Version

**Strategy**: KEEP AS-IS

**Optional**:
- Remove if not used
- Or integrate into validation workflow

### 10.5 Merge Strategy

**Classification**: SAFE

**Risk**: LOW
- No changes required
- Optional removal if unused

---

## 11. APICLIENT.LUA (LEGACY)

### 11.1 Purpose

HTTP communication layer (deprecated).

### 11.2 Current Implementation (ApiClient.lua)

**Location**: `studio-plugin/src/legacy/ApiClient.lua`
**Lines**: 150
**Status**: DEPRECATED

### 11.3 Analysis

**Status**: REMOVE

**Rationale**:
- Replaced by StudioConnector (protocol-based)
- Direct REST API calls are deprecated
- Not used by current implementations
- Kept only for reference

### 11.4 Recommended Final Version

**Strategy**: REMOVE

**Steps**:
1. Delete `studio-plugin/src/legacy/ApiClient.lua`
2. Delete `studio-plugin/src/legacy/` directory if empty

### 11.5 Merge Strategy

**Classification**: REMOVE

**Risk**: LOW
- Not used by current code
- Safe to remove after merge

---

## 12. SUMMARY OF CONFLICTS

### 12.1 Conflict Classification

| File | Classification | Risk | Priority |
|------|---------------|------|----------|
| ConnectionManager.lua | MANUAL | MEDIUM | HIGH |
| SyncManager.lua | MANUAL | MEDIUM | HIGH |
| CommandPanel.lua | MANUAL | MEDIUM | HIGH |
| plugin.lua | MANUAL - CRITICAL | HIGH | CRITICAL |
| Config.lua | SAFE | LOW | LOW |
| Events.lua | SAFE | LOW | LOW |
| StudioConnector.lua | SAFE | LOW | LOW |
| ArtifactLoader.lua | SAFE | LOW | LOW |
| ErrorReporter.lua | SAFE | LOW | LOW |
| RuntimeValidator.lua | SAFE | LOW | LOW |
| ApiClient.lua | REMOVE | LOW | LOW |

### 12.2 Critical Issues

1. **plugin.lua Corruption** (CRITICAL)
   - Lines 35-41 are garbled
   - Cannot load plugin
   - Must be fixed before testing

2. **Config Path Issues** (HIGH)
   - ConnectionManager.lua: script.Parent.Config (should be script.Parent.core.Config)
   - SyncManager.lua: script.Parent.Config (should be script.Parent.core.Config)

3. **Constructor Signature Mismatches** (HIGH)
   - ConnectionManager: needs events parameter
   - SyncManager: needs artifactLoader parameter
   - CommandPanel: needs events, artifactLoader parameters

### 12.3 Files Ready to Merge

**SAFE - No Changes Required**:
1. Config.lua
2. Events.lua
3. StudioConnector.lua
4. ArtifactLoader.lua
5. ErrorReporter.lua
6. RuntimeValidator.lua

**REMOVE**:
1. ApiClient.lua (legacy)

### 12.4 Files Requiring Manual Review

**MANUAL - Developer Decision Required**:
1. ConnectionManager.lua - Merge event system and project ID tracking
2. SyncManager.lua - Merge event system and stage targeting
3. CommandPanel.lua - Merge event system and UI enhancements
4. plugin.lua - Fix corruption and update constructor calls

---

## 13. FINAL MERGE RECOMMENDATION

### 13.1 Execution Order

**Phase 1: Critical Fixes (MUST DO FIRST)**
1. Fix plugin.lua corruption (lines 35-41)
2. Fix Config require paths in ConnectionManager.lua and SyncManager.lua

**Phase 2: Safe Operations**
1. Remove ApiClient.lua (legacy)
2. Verify safe files load correctly

**Phase 3: Manual Merges (IN ORDER)**
1. Merge ConnectionManager.lua (add events, project ID)
2. Merge SyncManager.lua (add events, stage targeting)
3. Merge CommandPanel.lua (add events, UI enhancements)

**Phase 4: Integration**
1. Update plugin.lua constructor calls
2. Test module loading
3. Test in Roblox Studio

### 13.2 Estimated Risk

**Overall Risk**: MEDIUM-HIGH

**Risk Breakdown**:
- **plugin.lua fix**: HIGH (critical, must work)
- **ConnectionManager merge**: MEDIUM (event integration)
- **SyncManager merge**: MEDIUM (event integration)
- **CommandPanel merge**: MEDIUM (event integration)
- **Config path fixes**: LOW (simple path updates)
- **ApiClient removal**: LOW (not used)

### 13.3 Exact Next Execution Steps

**Step 1: Fix plugin.lua**
```lua
-- Replace lines 35-41 with:
local events = Events.new()
local studioConnector = StudioConnector.new()
local connectionManager = ConnectionManager.new(studioConnector, events)
local syncManager = SyncManager.new(studioConnector, artifactLoader, errorReporter)
local artifactLoader = ArtifactLoader.new()
local errorReporter = ErrorReporter.new()
local runtimeValidator = RuntimeValidator.new()
```

**Step 2: Fix Config paths**
- ConnectionManager.lua: `require(script.Parent.core.Config)`
- SyncManager.lua: `require(script.Parent.core.Config)`

**Step 3: Update ConnectionManager.lua**
- Add events parameter to constructor
- Add event firing (STUDIO_CONNECTED, STUDIO_DISCONNECTED, RECONNECTING, RECONNECT_FAILED)
- Add projectId tracking
- Add getProjectId() and isConnected() methods

**Step 4: Update SyncManager.lua**
- Add events parameter to constructor
- Add event firing (PROJECT_SYNC_STARTED, PROJECT_SYNC_COMPLETED, PROJECT_SYNC_FAILED)
- Add stage targeting configuration

**Step 5: Update CommandPanel.lua**
- Add events parameter to constructor
- Add event binding (_bindEvents method)
- Add session info and sync info labels
- Add disconnect button
- Update status display to be event-driven

**Step 6: Update plugin.lua constructor calls**
- ConnectionManager.new(studioConnector, events)
- SyncManager.new(studioConnector, artifactLoader, errorReporter)
- CommandPanel.new(plugin, connectionManager, syncManager, events, artifactLoader, errorReporter)

**Step 7: Remove legacy files**
- Delete ConnectionManager_legacy.lua
- Delete SyncManager_legacy.lua
- Delete UI_legacy.lua
- Delete ApiClient.lua
- Delete legacy/ directory if empty

**Step 8: Validation**
- Verify all require paths resolve
- Verify no syntax errors
- Test in Roblox Studio

### 13.4 Rollback Plan

**If merge fails**:
1. Restore from backup: `cp -r backup/studio-plugin studio-plugin`
2. Or git reset: `git reset --hard pre-plugin-merge-v1.3.3`

### 13.5 Approval Required

**Before proceeding with Phase 2.5.E**:
- ✅ Review this analysis
- ✅ Approve merge strategy
- ✅ Approve execution order
- ⏸️ Execute manual merges
- ⏸️ Test in Roblox Studio

---

**Analysis Status**: ✅ COMPLETE
**Recommendation**: PAUSE for stakeholder approval
**Next Phase**: Phase 2.5.E (Package Configuration) - AWAITING APPROVAL
**Owner**: Architecture Team
