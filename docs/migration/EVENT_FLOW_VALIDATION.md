# EVENT FLOW VALIDATION

**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Phase**: 2.5.F - Event Flow Validation

---

## EXECUTIVE SUMMARY

This document describes the complete event lifecycle for the plugin, including connection events, sync events, and error events. It documents when events are fired, what payload they carry, and which components handle them.

**Event System**: ✅ VALIDATED

- **Total Events**: 8
- **Event Sources**: ConnectionManager, SyncManager
- **Event Handlers**: CommandPanel, plugin.lua
- **Event Flow**: Documented and verified

---

## 1. CONNECTION EVENT LIFECYCLE

### 1.1 STUDIO_CONNECTED

**Fired By**: ConnectionManager:connect()

**When Fired**:

- On successful connection to backend
- On successful reconnect

**Payload**:

```lua
{
    clientId = string,      -- Client ID from backend
    sessionId = string,     -- Session ID from backend
    projectId = string,     -- Project ID passed to connect()
}
```

**Handled By**:

- CommandPanel:_bindEvents() - Updates status label and session label
- plugin.lua - Logs connection to console

**Flow**:

```
User clicks Connect
  → CommandPanel:_onConnect()
  → ConnectionManager:connect(projectId)
  → StudioConnector:connect()
  → ConnectionManager fires STUDIO_CONNECTED
  → CommandPanel updates UI
  → plugin.lua logs to console
```

---

### 1.2 STUDIO_DISCONNECTED

**Fired By**: ConnectionManager:disconnect()

**When Fired**:

- On manual disconnect
- On plugin unload

**Payload**:

```lua
{
    clientId = string,      -- Client ID before disconnect
}
```

**Handled By**:

- CommandPanel:_bindEvents() - Updates status label and session label
- plugin.lua - Logs disconnect to console

**Flow**:

```
User clicks Disconnect
  → CommandPanel:_onDisconnect()
  → ConnectionManager:disconnect()
  → StudioConnector:disconnect()
  → ConnectionManager fires STUDIO_DISCONNECTED
  → CommandPanel updates UI
  → plugin.lua logs to console
```

---

### 1.3 CONNECTION_FAILED

**Fired By**: ConnectionManager:connect()

**When Fired**:

- On connection failure
- On reconnect failure (after max attempts)

**Payload**:

```lua
{
    error = string,         -- Error message
}
```

**Handled By**:

- CommandPanel:_bindEvents() - Updates status label with error
- plugin.lua - Logs failure to console

**Flow**:

```
Connection attempt fails
  → ConnectionManager:connect()
  → StudioConnector:connect() returns false
  → ConnectionManager fires CONNECTION_FAILED
  → CommandPanel updates UI
  → plugin.lua logs to console
```

---

### 1.4 RECONNECTING

**Fired By**: ConnectionManager:_attemptReconnect()

**When Fired**:

- On each reconnect attempt

**Payload**:

```lua
{
    attempt = number,       -- Current attempt number (1-5)
}
```

**Handled By**:

- CommandPanel:_bindEvents() - Updates status label with attempt number

**Flow**:

```
Heartbeat fails
  → ConnectionManager:_attemptReconnect()
  → ConnectionManager fires RECONNECTING
  → CommandPanel updates UI
  → Wait (exponential backoff)
  → Attempt reconnect
```

---

### 1.5 RECONNECT_FAILED

**Fired By**: ConnectionManager:_attemptReconnect()

**When Fired**:

- When max reconnect attempts reached (5)

**Payload**:

```lua
{
    attempts = number,      -- Total attempts made (5)
}
```

**Handled By**:

- ConnectionManager internal - Sets status to "failed"
- ErrorReporter - Reports error

**Flow**:

```
Reconnect attempt 5 fails
  → ConnectionManager:_attemptReconnect()
  → ConnectionManager fires RECONNECT_FAILED
  → ConnectionManager sets status to "failed"
  → ErrorReporter reports error
```

---

## 2. SYNC EVENT LIFECYCLE

### 2.1 PROJECT_SYNC_STARTED

**Fired By**: SyncManager:syncProject()

**When Fired**:

- At start of sync operation

**Payload**:

```lua
{
    projectId = string,     -- Project ID being synced
}
```

**Handled By**:

- Currently no handlers (can be added for UI feedback)

**Flow**:

```
User clicks Sync Project
  → CommandPanel:_onSync()
  → SyncManager:syncProject(projectId)
  → SyncManager fires PROJECT_SYNC_STARTED
  → Request project snapshot
```

---

### 2.2 PROJECT_SYNC_COMPLETED

**Fired By**: SyncManager:syncProject()

**When Fired**:

- On successful sync completion
- On empty project sync (0 artifacts)

**Payload**:

```lua
{
    projectId = string,     -- Project ID synced
    artifactCount = number, -- Number of artifacts synced
}
```

**Handled By**:

- CommandPanel:_bindEvents() - Updates sync label with time and count
- plugin.lua - Logs sync completion to console

**Flow**:

```
Artifacts loaded
  → SyncManager:syncProject()
  → SyncManager fires PROJECT_SYNC_COMPLETED
  → CommandPanel updates sync label
  → plugin.lua logs to console
```

---

### 2.3 PROJECT_SYNC_FAILED

**Fired By**: SyncManager:syncProject()

**When Fired**:

- On snapshot request failure
- On artifact transfer failure

**Payload**:

```lua
{
    error = string,         -- Error message
}
```

**Handled By**:

- Currently no handlers (can be added for UI feedback)

**Flow**:

```
Sync request fails
  → SyncManager:syncProject()
  → SyncManager fires PROJECT_SYNC_FAILED
  → ErrorReporter reports error
```

---

## 3. SCRIPT EVENT LIFECYCLE

### 3.1 SCRIPT_CREATED

**Fired By**: Not currently implemented

**When Fired**:

- When a script is created (deferred to ArtifactLoader)

**Payload**:

```lua
{
    name = string,          -- Script name
}
```

**Handled By**:

- plugin.lua - Logs script creation to console

**Note**: Event handler registered in plugin.lua but not currently fired

---

### 3.2 SCRIPT_UPDATED

**Fired By**: Not currently implemented

**When Fired**:

- When a script is updated (deferred to ArtifactLoader)

**Payload**:

```lua
{
    name = string,          -- Script name
}
```

**Handled By**:

- plugin.lua - Logs script update to console

**Note**: Event handler registered in plugin.lua but not currently fired

---

## 4. EVENT HANDLER REGISTRATION

### 4.1 CommandPanel Event Handlers

**Location**: CommandPanel:_bindEvents()

**Registered Handlers**:

```lua
events:on("STUDIO_CONNECTED", function(payload)
    -- Update status to green
    -- Update session label
end)

events:on("STUDIO_DISCONNECTED", function()
    -- Update status to gray
    -- Clear session label
end)

events:on("PROJECT_SYNC_COMPLETED", function(payload)
    -- Update sync label with time and count
end)

events:on("RECONNECTING", function(payload)
    -- Update status with attempt number
end)

events:on("CONNECTION_FAILED", function(payload)
    -- Update status with error message
end)
```

**Total Handlers**: 5

---

### 4.2 plugin.lua Event Handlers

**Location**: plugin.lua (Event Logging section)

**Registered Handlers**:

```lua
events:on("STUDIO_CONNECTED", function(payload)
    -- Log connection to console
end)

events:on("STUDIO_DISCONNECTED", function()
    -- Log disconnect to console
end)

events:on("PROJECT_SYNC_COMPLETED", function(payload)
    -- Log sync completion to console
end)

events:on("SCRIPT_CREATED", function(payload)
    -- Log script creation to console
end)

events:on("SCRIPT_UPDATED", function(payload)
    -- Log script update to console
end)

events:on("CONNECTION_FAILED", function(payload)
    -- Log connection failure to console
end)
```

**Total Handlers**: 6

---

## 5. EVENT FLOW DIAGRAMS

### 5.1 Connection Flow

```
┌─────────────┐
│ User Clicks │
│  Connect    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ CommandPanel:   │
│ _onConnect()   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ ConnectionMgr:  │
│ connect()       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ StudioConnector │
│ :connect()      │
└──────┬──────────┘
       │
       ├─ Success ──┐
       │            │
       │            ▼
       │    ┌─────────────────┐
       │    │ Fire Event:     │
       │    │ STUDIO_CONNECTED│
       │    └────────┬________┘
       │             │
       │             ├─→ CommandPanel updates UI
       │             └─→ plugin.lua logs
       │
       └─ Failure ──┐
                    │
                    ▼
             ┌─────────────────┐
             │ Fire Event:     │
             │ CONNECTION_FAILED│
             └────────┬________┘
                      │
                      ├─→ CommandPanel updates UI
                      └─→ plugin.lua logs
```

---

### 5.2 Sync Flow

```
┌─────────────┐
│ User Clicks │
│ Sync Project│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ CommandPanel:   │
│ _onSync()       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ SyncManager:    │
│ syncProject()   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Fire Event:     │
│ PROJECT_SYNC_   │
│ STARTED         │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Request Snapshot│
└──────┬──────────┘
       │
       ├─ Success ──┐
       │            │
       │            ▼
       │    ┌─────────────────┐
       │    │ Transfer Artifacts│
       │    └────────┬────────┘
       │             │
       │             ▼
       │    ┌─────────────────┐
       │    │ Load Artifacts  │
       │    └────────┬────────┘
       │             │
       │             ▼
       │    ┌─────────────────┐
       │    │ Fire Event:     │
       │    │ PROJECT_SYNC_   │
       │    │ COMPLETED       │
       │    └────────┬────────┘
       │             │
       │             ├─→ CommandPanel updates UI
       │             └─→ plugin.lua logs
       │
       └─ Failure ──┐
                    │
                    ▼
             ┌─────────────────┐
             │ Fire Event:     │
             │ PROJECT_SYNC_   │
             │ FAILED          │
             └────────┬────────┘
                      │
                      └─→ ErrorReporter reports
```

---

## 6. EVENT SAFETY

### 6.1 Event Guarding

All event calls are guarded with `if self._events then` checks:

```lua
if self._events then
    self._events:fire("EVENT_NAME", payload)
end
```

**Purpose**: Prevent errors if events parameter is nil

**Status**: ✅ All event calls properly guarded

### 6.2 Event Handler Error Handling

Events system uses pcall for handler execution:

```lua
task.spawn(function()
    local success, err = pcall(handler, payload)
    if not success then
        warn("[AIStudio Events] Handler error:", err)
    end
end)
```

**Purpose**: Prevent handler errors from crashing the plugin

**Status**: ✅ Error handling implemented

---

## 7. SUMMARY

### 7.1 Events Summary

**Connection Events**: 5

- STUDIO_CONNECTED
- STUDIO_DISCONNECTED
- CONNECTION_FAILED
- RECONNECTING
- RECONNECT_FAILED

**Sync Events**: 3

- PROJECT_SYNC_STARTED
- PROJECT_SYNC_COMPLETED
- PROJECT_SYNC_FAILED

**Script Events**: 2 (deferred)

- SCRIPT_CREATED
- SCRIPT_UPDATED

**Total Events**: 8

### 7.2 Event Handlers Summary

**CommandPanel**: 5 handlers
**plugin.lua**: 6 handlers

**Total Handlers**: 11

### 7.3 Validation Status

**Event Flow**: ✅ VALIDATED

- All events documented
- All payloads documented
- All handlers documented
- Event safety verified

---

**Event Flow Validation Status**: ✅ COMPLETE
**Next Step**: Runtime Test Plan
**Owner**: Architecture Team
