# PLUGIN MERGE EXECUTION PLAN
**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Phase**: 2.5 - Plugin Merge Execution Plan

---

## EXECUTIVE SUMMARY

This document provides the detailed execution plan for merging the two Roblox Studio plugin directories (`RobloxAIStudioPlugin/` and `studio-plugin/`) into a single, unified plugin.

**Strategy**: Option A - Merge RobloxAIStudioPlugin into studio-plugin
**Estimated Effort**: 12 hours
**Risk Level**: LOW-MEDIUM
**Status**: READY FOR EXECUTION (pending approval)

---

## 1. CURRENT STATE

### 1.1 RobloxAIStudioPlugin (Legacy)

**Version**: 2.1.0
**Status**: Legacy
**Purpose**: Original plugin implementation

**Entry Point**: `plugin.lua`

**Dependencies**:
- HttpService (Roblox)
- No external dependencies

**Build System**: None (Lua files directly loaded by Roblox Studio)

**Runtime Behavior**:
- Direct REST API communication
- Session-based authentication
- Heartbeat keep-alive (15s interval)
- Project synchronization
- Artifact loading

**File Structure**:
```
RobloxAIStudioPlugin/
├── plugin.lua              (5,155 bytes)  — Entry point
├── src/
│   ├── ApiClient.lua       (3,089 bytes)  — HTTP communication
│   ├── ConnectionManager.lua (3,303 bytes) — Connection lifecycle
│   ├── Events.lua           (1,626 bytes)  — Event handling
│   ├── SyncManager.lua     (3,380 bytes)  — Project synchronization
│   └── UI.lua              (5,651 bytes)  — Plugin widget UI
└── README.md               (1,666 bytes)
```

**API Endpoints Used**:
- `POST /api/studio/connect`
- `POST /api/studio/heartbeat`
- `POST /api/studio/disconnect`
- `GET /api/studio/status`
- `POST /api/studio/sync/project`
- `POST /api/studio/sync/artifacts`

---

### 1.2 studio-plugin (Current)

**Version**: 1.7.0 (Alpha)
**Status**: Current / Production-grade
**Purpose**: Enhanced plugin with protocol-based messaging

**Entry Point**: None (needs creation)

**Dependencies**:
- HttpService (Roblox)
- No external dependencies

**Build System**: None (Lua files directly loaded by Roblox Studio)

**Runtime Behavior**:
- Protocol-based messaging (HELLO, PING, PONG, STATUS, etc.)
- Structured message format with protocol version
- Session-based authentication
- Heartbeat keep-alive (15s interval)
- Project synchronization
- Artifact loading with validation
- Runtime validation
- Centralized error reporting

**File Structure**:
```
studio-plugin/
├── src/
│   ├── Config.lua            (362 bytes)   — Configuration constants
│   ├── StudioConnector.lua   (4,091 bytes) — Protocol-level HTTP communication
│   ├── ConnectionManager.lua (2,482 bytes) — Connection lifecycle
│   ├── SyncManager.lua       (2,189 bytes) — Project synchronization
│   ├── ArtifactLoader.lua    (2,751 bytes) — Instance creation from artifacts
│   ├── CommandPanel.lua      (3,883 bytes) — Plugin UI widget
│   ├── ErrorReporter.lua     (989 bytes)   — Centralized error handling
│   └── RuntimeValidator.lua (4,059 bytes) — Runtime validation
└── README.md                 (1,735 bytes)
```

**API Endpoints Used**:
- `POST /api/studio/connect`
- `POST /api/studio/disconnect`
- Protocol-based message endpoints

---

## 2. MERGE TARGET

### 2.1 Final Structure

```
studio-plugin/
├── plugin.lua              — Entry point (NEW)
├── src/
│   ├── core/                — Core functionality
│   │   ├── Config.lua      — Configuration constants
│   │   └── Events.lua      — Event system (from legacy)
│   ├── commands/            — Command handlers
│   │   └── (future expansion)
│   ├── services/            — Service layer
│   │   ├── StudioConnector.lua    — Protocol-level HTTP
│   │   ├── ConnectionManager.lua  — Connection lifecycle (merged)
│   │   └── SyncManager.lua        — Project sync (merged)
│   ├── ui/                  — UI components
│   │   ├── CommandPanel.lua       — Plugin widget UI
│   │   └── (future expansion)
│   ├── utils/               — Utilities
│   │   ├── ArtifactLoader.lua     — Instance creation
│   │   ├── ErrorReporter.lua      — Error handling
│   │   └── RuntimeValidator.lua   — Runtime validation
│   └── legacy/              — Legacy compatibility (optional)
│       └── ApiClient.lua  — Legacy API client (deprecated)
├── assets/                  — Plugin assets (NEW)
├── package.json             — Metadata (NEW)
└── README.md               — Updated documentation
```

### 2.2 Rationale for Structure

- **core/**: Core functionality shared across plugin
- **commands/**: Command handlers for future extensibility
- **services/**: Business logic layer
- **ui/**: UI components
- **utils/**: Utility functions
- **legacy/**: Deprecated code for backward compatibility (optional)

---

## 3. FILE MIGRATION MAP

### 3.1 File Migration Table

| Current File | Destination | Action | Risk | Notes |
|--------------|-------------|--------|------|-------|
| `RobloxAIStudioPlugin/plugin.lua` | `studio-plugin/plugin.lua` | MOVE & ADAPT | LOW | Adapt to use studio-plugin modules |
| `RobloxAIStudioPlugin/src/Events.lua` | `studio-plugin/src/core/Events.lua` | MOVE | LOW | Integrate with studio-plugin architecture |
| `RobloxAIStudioPlugin/src/ConnectionManager.lua` | `studio-plugin/src/services/ConnectionManager.lua` | MERGE | MEDIUM | Merge with existing ConnectionManager.lua |
| `RobloxAIStudioPlugin/src/SyncManager.lua` | `studio-plugin/src/services/SyncManager.lua` | MERGE | MEDIUM | Merge with existing SyncManager.lua |
| `RobloxAIStudioPlugin/src/UI.lua` | `studio-plugin/src/ui/CommandPanel.lua` | MERGE | MEDIUM | Merge features into CommandPanel.lua |
| `RobloxAIStudioPlugin/src/ApiClient.lua` | `studio-plugin/src/legacy/ApiClient.lua` | MOVE | LOW | Deprecate, keep for compatibility |
| `studio-plugin/src/Config.lua` | `studio-plugin/src/core/Config.lua` | MOVE | LOW | Move to core/ |
| `studio-plugin/src/StudioConnector.lua` | `studio-plugin/src/services/StudioConnector.lua` | MOVE | LOW | Move to services/ |
| `studio-plugin/src/ArtifactLoader.lua` | `studio-plugin/src/utils/ArtifactLoader.lua` | MOVE | LOW | Move to utils/ |
| `studio-plugin/src/ErrorReporter.lua` | `studio-plugin/src/utils/ErrorReporter.lua` | MOVE | LOW | Move to utils/ |
| `studio-plugin/src/RuntimeValidator.lua` | `studio-plugin/src/utils/RuntimeValidator.lua` | MOVE | LOW | Move to utils/ |
| `studio-plugin/src/CommandPanel.lua` | `studio-plugin/src/ui/CommandPanel.lua` | MOVE | LOW | Move to ui/ |
| `RobloxAIStudioPlugin/README.md` | `docs/archive/RobloxAIStudioPlugin_README.md` | ARCHIVE | LOW | Preserve for reference |
| `studio-plugin/README.md` | `studio-plugin/README.md` | UPDATE | LOW | Update with new structure |

### 3.2 New Files to Create

| File | Purpose | Risk |
|------|---------|------|
| `studio-plugin/plugin.lua` | Entry point | LOW |
| `studio-plugin/assets/` | Plugin assets | LOW |
| `studio-plugin/package.json` | Metadata | LOW |

---

## 4. DEPENDENCY CHANGES

### 4.1 package.json (NEW)

```json
{
  "name": "roblox-ai-studio-plugin",
  "version": "1.8.0",
  "description": "Roblox AI Studio Plugin for connecting to the AI Studio DevKit backend",
  "main": "plugin.lua",
  "scripts": {},
  "keywords": ["roblox", "ai", "studio", "plugin"],
  "author": "Roblox AI Studio Team",
  "license": "MIT",
  "roblox": {
    "compatibility": "Studio 2024+",
    "apiVersion": "1.0.0"
  }
}
```

### 4.2 Import Changes

**Before (RobloxAIStudioPlugin/plugin.lua)**:
```lua
local ApiClient = require(script.Parent.src.ApiClient)
local ConnectionManager = require(script.Parent.src.ConnectionManager)
local SyncManager = require(script.Parent.src.SyncManager)
local Events = require(script.Parent.src.Events)
local UI = require(script.Parent.src.UI)
```

**After (studio-plugin/plugin.lua)**:
```lua
local Config = require(script.Parent.src.core.Config)
local Events = require(script.Parent.src.core.Events)
local StudioConnector = require(script.Parent.src.services.StudioConnector)
local ConnectionManager = require(script.Parent.src.services.ConnectionManager)
local SyncManager = require(script.Parent.src.services.SyncManager)
local CommandPanel = require(script.Parent.src.ui.CommandPanel)
local ArtifactLoader = require(script.Parent.src.utils.ArtifactLoader)
local ErrorReporter = require(script.Parent.src.utils.ErrorReporter)
local RuntimeValidator = require(script.Parent.src.utils.RuntimeValidator)
```

### 4.3 Build Scripts

No build scripts required (Lua files loaded directly by Roblox Studio).

### 4.4 Configuration Changes

**Config.lua Updates**:
- Add configuration options from legacy plugin.lua
- Add protocol version configuration
- Add heartbeat configuration
- Add reconnection configuration

**New Configuration Options**:
```lua
Config.BACKEND_URL = "http://localhost:5000"
Config.API_KEY = ""
Config.PROTOCOL_VERSION = "1.0.0"
Config.PLUGIN_VERSION = "1.8.0"
Config.HEARTBEAT_INTERVAL = 15
Config.RECONNECT_MAX_ATTEMPTS = 5
Config.SESSION_TIMEOUT = 60
Config.PAYLOAD_MAX_SIZE = 1048576
Config.ENABLE_LEGACY_API = false  -- For backward compatibility
```

---

## 5. TESTING STRATEGY

### 5.1 Roblox Studio Tests

#### Test 1: Plugin Loading
**Objective**: Verify plugin loads without errors in Roblox Studio

**Steps**:
1. Open Roblox Studio
2. Navigate to Plugins folder
3. Copy merged plugin files
4. Restart Roblox Studio
5. Verify toolbar button appears
6. Verify no console errors

**Expected Result**: Plugin loads successfully, toolbar button appears, no errors

**Priority**: CRITICAL

---

#### Test 2: UI Functionality
**Objective**: Verify UI widget displays and functions correctly

**Steps**:
1. Click toolbar button
2. Verify UI panel opens
3. Verify all UI elements display
4. Test all buttons and inputs
5. Verify responsive behavior

**Expected Result**: UI displays correctly, all interactions work

**Priority**: CRITICAL

---

#### Test 3: Commands
**Objective**: Verify plugin commands execute correctly

**Steps**:
1. Test connect command
2. Test disconnect command
3. Test sync command
4. Test status command
5. Verify command responses

**Expected Result**: All commands execute successfully

**Priority**: CRITICAL

---

#### Test 4: Events
**Objective**: Verify event system works correctly

**Steps**:
1. Trigger connection event
2. Trigger heartbeat event
3. Trigger sync event
4. Trigger error event
5. Verify event handlers execute

**Expected Result**: All events fire and are handled correctly

**Priority**: HIGH

---

### 5.2 Backend Tests

#### Test 1: Authentication
**Objective**: Verify plugin authenticates with backend

**Steps**:
1. Start backend server
2. Connect plugin
3. Verify authentication succeeds
4. Verify session token received
5. Verify session persists

**Expected Result**: Authentication succeeds, session established

**Priority**: CRITICAL

---

#### Test 2: API Communication
**Objective**: Verify plugin communicates with backend API

**Steps**:
1. Test connect endpoint
2. Test heartbeat endpoint
3. Test sync endpoint
4. Test disconnect endpoint
5. Verify all responses

**Expected Result**: All API calls succeed

**Priority**: CRITICAL

---

#### Test 3: AI Requests
**Objective**: Verify plugin can trigger AI generation

**Steps**:
1. Create test project
2. Trigger generation via plugin
3. Verify request sent to backend
4. Verify response received
5. Verify artifacts loaded

**Expected Result**: AI generation completes successfully

**Priority**: HIGH

---

### 5.3 Build Tests

#### Test 1: Installation
**Objective**: Verify plugin can be installed

**Steps**:
1. Copy plugin to Roblox Studio plugins folder
2. Restart Roblox Studio
3. Verify plugin appears in plugin manager
4. Verify plugin loads

**Expected Result**: Plugin installs and loads successfully

**Priority**: CRITICAL

---

#### Test 2: Build (if applicable)
**Objective**: Verify build process works (if build system added)

**Steps**:
1. Run build script (if exists)
2. Verify no errors
3. Verify output files generated
4. Verify output files valid

**Expected Result**: Build succeeds, output valid

**Priority**: LOW (no build system currently)

---

## 6. ROLLBACK PLAN

### 6.1 Backup Point

**Before Merge**:
1. Create git branch: `feature/plugin-merge`
2. Tag current state: `pre-plugin-merge-v1.3.3`
3. Copy both plugin directories to temporary backup:
   - `backup/RobloxAIStudioPlugin/`
   - `backup/studio-plugin/`

**Commands**:
```bash
git checkout -b feature/plugin-merge
git tag pre-plugin-merge-v1.3.3
mkdir -p backup
cp -r RobloxAIStudioPlugin backup/
cp -r studio-plugin backup/
```

---

### 6.2 Git Strategy

**Branch Strategy**:
- Work on `feature/plugin-merge` branch
- Commit frequently with descriptive messages
- Use atomic commits (one logical change per commit)
- Squash commits before merge if needed

**Merge Strategy**:
- Create pull request after completion
- Require code review
- Require all tests to pass
- Merge to main after approval

---

### 6.3 Rollback Steps

If merge fails or causes issues:

**Option 1: Git Rollback**
```bash
# Discard changes on branch
git reset --hard pre-plugin-merge-v1.3.3

# Or delete branch and checkout main
git checkout main
git branch -D feature/plugin-merge
```

**Option 2: File Restoration**
```bash
# Restore from backup
rm -rf studio-plugin
cp -r backup/studio-plugin studio-plugin
rm -rf RobloxAIStudioPlugin
cp -r backup/RobloxAIStudioPlugin RobloxAIStudioPlugin
```

**Option 3: Selective Rollback**
```bash
# Restore specific files from backup
cp backup/studio-plugin/src/ConnectionManager.lua studio-plugin/src/
cp backup/studio-plugin/src/SyncManager.lua studio-plugin/src/
```

---

### 6.4 Rollback Triggers

**Trigger Rollback If**:
- Plugin fails to load in Roblox Studio
- Critical functionality broken
- Backend communication fails
- UI fails to display
- Tests fail
- Performance degradation > 50%

---

## 7. EXECUTION CHECKLIST

### Phase 2.1: Preparation
- [ ] Create git branch `feature/plugin-merge`
- [ ] Tag current state `pre-plugin-merge-v1.3.3`
- [ ] Create backup directories
- [ ] Copy both plugins to backup
- [ ] Review PLUGIN_MERGE_PLAN.md
- [ ] Review this execution plan

### Phase 2.2: Create Entry Point
- [ ] Create `studio-plugin/plugin.lua`
- [ ] Adapt from `RobloxAIStudioPlugin/plugin.lua`
- [ ] Update to use studio-plugin modules
- [ ] Update configuration to use Config.lua
- [ ] Update HTTP layer to use StudioConnector.lua
- [ ] Test plugin loads

### Phase 2.3: Reorganize Directory Structure
- [ ] Create `studio-plugin/src/core/`
- [ ] Create `studio-plugin/src/commands/`
- [ ] Create `studio-plugin/src/services/`
- [ ] Create `studio-plugin/src/ui/`
- [ ] Create `studio-plugin/src/utils/`
- [ ] Create `studio-plugin/src/legacy/`
- [ ] Create `studio-plugin/assets/`

### Phase 2.4: Move Files
- [ ] Move `Config.lua` to `core/`
- [ ] Move `Events.lua` to `core/`
- [ ] Move `StudioConnector.lua` to `services/`
- [ ] Move `ArtifactLoader.lua` to `utils/`
- [ ] Move `ErrorReporter.lua` to `utils/`
- [ ] Move `RuntimeValidator.lua` to `utils/`
- [ ] Move `CommandPanel.lua` to `ui/`
- [ ] Move `ApiClient.lua` to `legacy/`

### Phase 2.5: Merge ConnectionManager.lua
- [ ] Compare both implementations
- [ ] Identify features in legacy not in current
- [ ] Add missing features to studio-plugin version
- [ ] Test connection lifecycle
- [ ] Test heartbeat and reconnection

### Phase 2.6: Merge SyncManager.lua
- [ ] Compare both implementations
- [ ] Identify features in legacy not in current
- [ ] Add missing features to studio-plugin version
- [ ] Test project synchronization
- [ ] Test artifact handling

### Phase 2.7: Integrate Events.lua
- [ ] Copy Events.lua from legacy
- [ ] Integrate with studio-plugin architecture
- [ ] Update all modules to use event system
- [ ] Test event propagation

### Phase 2.8: Enhance UI
- [ ] Compare UI.lua with CommandPanel.lua
- [ ] Identify UI features in legacy not in current
- [ ] Add missing features to CommandPanel.lua
- [ ] Test UI functionality
- [ ] Test user interactions

### Phase 2.9: Update Configuration
- [ ] Ensure Config.lua has all necessary settings
- [ ] Add any missing configuration from legacy
- [ ] Document all configuration options
- [ ] Test configuration loading

### Phase 2.10: Create package.json
- [ ] Create `studio-plugin/package.json`
- [ ] Add metadata
- [ ] Add version information
- [ ] Add dependencies (if any)

### Phase 2.11: Update Documentation
- [ ] Update `studio-plugin/README.md`
- [ ] Document new architecture
- [ ] Document configuration options
- [ ] Document API protocol
- [ ] Create migration guide for users

### Phase 2.12: Testing
- [ ] Load plugin in Roblox Studio
- [ ] Test connection to backend
- [ ] Test heartbeat
- [ ] Test project synchronization
- [ ] Test artifact loading
- [ ] Test error handling
- [ ] Test UI interactions
- [ ] Test reconnection logic

### Phase 2.13: Cleanup
- [ ] Remove `RobloxAIStudioPlugin/` directory
- [ ] Update any references in documentation
- [ ] Update any references in server code
- [ ] Archive legacy README
- [ ] Commit changes

### Phase 2.14: Final Validation
- [ ] All tests pass
- [ ] Plugin loads successfully
- [ ] No console errors
- [ ] Documentation updated
- [ ] Git history preserved

---

## 8. RISK MITIGATION

### 8.1 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Plugin fails to load | LOW | HIGH | Test incrementally, keep backup |
| Merge conflicts | MEDIUM | MEDIUM | Careful comparison, manual review |
| Broken functionality | LOW | HIGH | Comprehensive testing |
| Performance degradation | LOW | MEDIUM | Benchmark before/after |
| Documentation errors | LOW | LOW | Peer review of docs |

### 8.2 Mitigation Strategies

**Incremental Approach**:
- Complete one phase at a time
- Test after each phase
- Commit after each phase
- Rollback if phase fails

**Testing Strategy**:
- Test in isolated Roblox Studio environment
- Test with backend running locally
- Test with backend running remotely
- Test with various project sizes

**Documentation**:
- Document all changes
- Update README files
- Create migration guide
- Archive old documentation

---

## 9. SUCCESS CRITERIA

### 9.1 Functional Criteria

- [ ] Plugin loads in Roblox Studio without errors
- [ ] Toolbar button appears and functions
- [ ] Connection to backend succeeds
- [ ] Heartbeat maintains connection
- [ ] Project sync works correctly
- [ ] Artifact loading works correctly
- [ ] UI displays and functions correctly
- [ ] Error reporting works correctly
- [ ] Reconnection works on failure
- [ ] All tests pass

### 9.2 Code Quality Criteria

- [ ] No Lua syntax errors
- [ ] No missing module references
- [ ] All requires resolve correctly
- [ ] Configuration loads correctly
- [ ] No console errors
- [ ] Code follows existing style

### 9.3 Documentation Criteria

- [ ] README.md updated
- [ ] Installation instructions accurate
- [ ] Configuration documented
- [ ] API protocol documented
- [ ] Migration guide created

---

## 10. POST-MERGE TASKS

### 10.1 Immediate

- [ ] Delete `RobloxAIStudioPlugin/` directory
- [ ] Update root README.md to reference new plugin
- [ ] Update server documentation to reference new plugin
- [ ] Archive legacy plugin documentation

### 10.2 Short-term

- [ ] Monitor plugin usage
- [ ] Collect user feedback
- [ ] Fix any bugs discovered
- [ ] Add missing features if needed

### 10.3 Long-term

- [ ] Consider adding build system
- [ ] Consider adding automated tests
- [ ] Consider adding CI/CD for plugin
- [ ] Consider adding plugin marketplace submission

---

## 11. SUMMARY

### 11.1 Execution Plan

**Total Phases**: 14
**Estimated Effort**: 12 hours
**Risk Level**: LOW-MEDIUM
**Rollback Available**: Yes

### 11.2 Key Changes

- **Files Moved**: 11
- **Files Created**: 3
- **Files Merged**: 3
- **Files Deleted**: 1 (RobloxAIStudioPlugin/)
- **Documentation Updated**: 2

### 11.3 Testing

- **Roblox Studio Tests**: 4
- **Backend Tests**: 3
- **Build Tests**: 2

### 11.4 Next Steps

1. ✅ Review execution plan
2. ⏭️ Get stakeholder approval
3. ⏭️ Create feature branch
4. ⏭️ Execute Phase 2.1-2.14
5. ⏭️ Validate and test
6. ⏭️ Merge to main
7. ⏭️ Update documentation

---

**Execution Plan Status**: READY FOR EXECUTION
**Approval Required**: YES
**Next Phase**: Phase 2 Implementation (awaiting approval)
**Owner**: Architecture Team
