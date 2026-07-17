# ROBLOX STUDIO PLUGIN TEST PLAN
**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Phase**: 2.5.F - Runtime Test Preparation

---

## EXECUTIVE SUMMARY

This test plan provides comprehensive testing procedures for the merged Roblox Studio plugin. It covers loading, connection, sync, UI, and error handling tests to ensure the plugin functions correctly in the Roblox Studio environment.

**Test Status**: ⏸️ READY FOR EXECUTION
- **Test Categories**: 5
- **Total Test Cases**: 30+
- **Prerequisites**: Roblox Studio, Backend server

---

## 1. PRE-TEST REQUIREMENTS

### 1.1 Environment Setup

**Roblox Studio**:
- [ ] Roblox Studio installed and running
- [ ] HttpService enabled (Game Settings → Security → Allow HTTP Requests)
- [ ] Place created or opened

**Backend Server**:
- [ ] DevKit backend running at http://localhost:5000
- [ ] Backend API endpoints accessible
- [ ] Backend database operational

**Plugin Files**:
- [ ] studio-plugin/ directory in correct location
- [ ] plugin.lua in root of studio-plugin/
- [ ] All module files present (core/, services/, ui/, utils/)
- [ ] No missing files

### 1.2 Plugin Installation

**Installation Steps**:
1. Copy studio-plugin/ directory to Roblox Studio plugins location
2. Restart Roblox Studio
3. Navigate to Plugins → Manage Plugins
4. Verify "Roblox AI Studio" appears in plugin list

**Expected Result**: Plugin appears in plugin list without errors

---

## 2. LOADING TEST

### 2.1 Plugin Load Test

**Test Case**: Plugin loads without errors

**Steps**:
1. Open Roblox Studio
2. Open a place
3. Check console for load message
4. Check toolbar for AI Studio button

**Expected Result**:
- Console shows: `[AI Studio] Plugin v1.7.0 loaded. Backend: http://localhost:5000`
- Toolbar shows "AI Studio" button
- No errors in console

**Actual Result**: ⏸️ PENDING

---

### 2.2 Module Load Test

**Test Case**: All modules load correctly

**Steps**:
1. Check console for require errors
2. Verify no "module not found" errors
3. Verify no syntax errors

**Expected Result**:
- No require errors
- No syntax errors
- All modules loaded successfully

**Actual Result**: ⏸️ PENDING

---

### 2.3 Initialization Test

**Test Case**: Plugin initializes correctly

**Steps**:
1. Check console for initialization messages
2. Verify no initialization errors
3. Verify toolbar button is clickable

**Expected Result**:
- No initialization errors
- Toolbar button responds to hover
- No warnings in console

**Actual Result**: ⏸️ PENDING

---

## 3. CONNECTION TEST

### 3.1 Connect Test

**Test Case**: Connect to backend successfully

**Prerequisites**: Backend server running

**Steps**:
1. Click toolbar button to open plugin widget
2. Click "Connect" button
3. Observe status label
4. Observe session label

**Expected Result**:
- Status changes to "Connecting..." (orange)
- Status changes to "Connected" (green)
- Session label shows session ID (truncated to 16 chars)
- Console shows: `[AI Studio] Connected to backend. Client: <clientId>`
- No errors in console

**Actual Result**: ⏸️ PENDING

---

### 3.2 Disconnect Test

**Test Case**: Disconnect from backend successfully

**Steps**:
1. Ensure connected to backend
2. Click "Disconnect" button
3. Observe status label
4. Observe session label

**Expected Result**:
- Status changes to "Disconnected" (gray)
- Session label shows "Session: —"
- Console shows: `[AI Studio] Disconnected from backend.`
- No errors in console

**Actual Result**: ⏸️ PENDING

---

### 3.3 Connection Failure Test

**Test Case**: Handle connection failure gracefully

**Prerequisites**: Backend server NOT running

**Steps**:
1. Stop backend server
2. Click "Connect" button
3. Observe status label
4. Observe console

**Expected Result**:
- Status changes to "Failed: <error message>" (red)
- Console shows: `[AI Studio] Connection failed: <error>`
- No plugin crash
- UI remains responsive

**Actual Result**: ⏸️ PENDING

---

### 3.4 Reconnect Test

**Test Case**: Auto-reconnect on connection loss

**Prerequisites**: Backend server running

**Steps**:
1. Connect to backend
2. Stop backend server
3. Wait for heartbeat failure (15 seconds)
4. Observe status label
5. Restart backend server
6. Observe reconnection

**Expected Result**:
- Status shows "Reconnecting (1)..." (orange)
- Status shows "Reconnecting (2)..." (orange)
- After 5 attempts: "Failed: Reconnect failed after 5 attempts" (red)
- After backend restart: Status changes to "Connected" (green)
- Console shows reconnect events

**Actual Result**: ⏸️ PENDING

---

### 3.5 Heartbeat Test

**Test Case**: Heartbeat maintains connection

**Prerequisites**: Backend server running

**Steps**:
1. Connect to backend
2. Wait 30 seconds
3. Verify connection remains active
4. Check console for heartbeat logs

**Expected Result**:
- Connection remains active
- Status remains "Connected" (green)
- No disconnect events
- No reconnect events

**Actual Result**: ⏸️ PENDING

---

## 4. SYNC TEST

### 4.1 Sync Success Test

**Test Case**: Sync project successfully

**Prerequisites**: Backend server running, connected to backend

**Steps**:
1. Connect to backend
2. Click "Sync Project" button
3. Observe sync label
4. Observe console

**Expected Result**:
- Sync label shows "Syncing..."
- Sync label shows "Last sync: <time> (<count> artifacts)"
- Console shows: `[AI Studio] Sync completed: <count> artifacts`
- Artifacts loaded into Studio
- No errors in console

**Actual Result**: ⏸️ PENDING

---

### 4.2 Sync Empty Project Test

**Test Case**: Sync empty project (0 artifacts)

**Prerequisites**: Backend server running, connected to backend, empty project

**Steps**:
1. Connect to backend
2. Click "Sync Project" button
3. Observe sync label
4. Observe console

**Expected Result**:
- Sync label shows "Last sync: <time> (0 artifacts)"
- Console shows: `[AI Studio] Sync completed: 0 artifacts`
- No errors in console

**Actual Result**: ⏸️ PENDING

---

### 4.3 Sync Failure Test

**Test Case**: Handle sync failure gracefully

**Prerequisites**: Backend server running, connected to backend

**Steps**:
1. Connect to backend
2. Stop backend server
3. Click "Sync Project" button
4. Observe sync label
5. Observe console

**Expected Result**:
- Sync label shows "Sync Failed"
- Console shows error message
- No plugin crash
- UI remains responsive

**Actual Result**: ⏸️ PENDING

---

### 4.4 Sync Without Connection Test

**Test Case**: Prevent sync when not connected

**Prerequisites**: Not connected to backend

**Steps**:
1. Ensure disconnected from backend
2. Click "Sync Project" button
3. Observe status label

**Expected Result**:
- Status shows "Connect first" (red)
- No sync attempt made
- No errors in console

**Actual Result**: ⏸️ PENDING

---

## 5. UI TEST

### 5.1 Widget Open Test

**Test Case**: Widget opens correctly

**Steps**:
1. Click toolbar button
2. Observe widget appearance
3. Verify widget title
4. Verify widget size

**Expected Result**:
- Widget opens in dock panel
- Widget title is "AI Studio"
- Widget size is approximately 280x350
- All UI elements visible

**Actual Result**: ⏸️ PENDING

---

### 5.2 Widget Close Test

**Test Case**: Widget closes correctly

**Steps**:
1. Click toolbar button to open widget
2. Click toolbar button again to close widget
3. Observe widget disappearance

**Expected Result**:
- Widget closes
- Widget can be reopened
- No errors in console

**Actual Result**: ⏸️ PENDING

---

### 5.3 Button Test

**Test Case**: All buttons respond to clicks

**Steps**:
1. Click "Connect" button
2. Click "Generate" button
3. Click "Sync Project" button
4. Click "Disconnect" button
5. Click "Show Errors" button

**Expected Result**:
- All buttons respond to clicks
- All buttons show visual feedback
- No buttons are unresponsive

**Actual Result**: ⏸️ PENDING

---

### 5.4 Status Label Test

**Test Case**: Status label updates correctly

**Steps**:
1. Observe initial status ("Disconnected")
2. Click "Connect" button
3. Observe status change to "Connecting..."
4. Observe status change to "Connected" (green)
5. Click "Disconnect" button
6. Observe status change to "Disconnected" (gray)

**Expected Result**:
- Status label updates correctly
- Status color changes correctly
- No status label errors

**Actual Result**: ⏸️ PENDING

---

### 5.5 Session Label Test

**Test Case**: Session label updates correctly

**Steps**:
1. Observe initial session label ("Session: —")
2. Connect to backend
3. Observe session label update
4. Disconnect from backend
5. Observe session label reset

**Expected Result**:
- Session label shows "Session: —" when disconnected
- Session label shows session ID when connected (truncated to 16 chars)
- Session label resets to "Session: —" on disconnect

**Actual Result**: ⏸️ PENDING

---

### 5.6 Sync Label Test

**Test Case**: Sync label updates correctly

**Steps**:
1. Observe initial sync label ("Last sync: Never")
2. Sync project
3. Observe sync label update

**Expected Result**:
- Sync label shows "Last sync: Never" initially
- Sync label shows "Last sync: <time> (<count> artifacts)" after sync
- Sync label shows "Syncing..." during sync

**Actual Result**: ⏸️ PENDING

---

### 5.7 Generate Button Test

**Test Case**: Generate button shows stub behavior

**Steps**:
1. Click "Generate" button
2. Observe status label

**Expected Result**:
- Status shows "Generating..." (yellow)
- No actual generation (stub behavior)
- No errors in console

**Actual Result**: ⏸️ PENDING

---

## 6. ERROR HANDLING TEST

### 6.1 Error Reporter Test

**Test Case**: Error reporter captures errors

**Steps**:
1. Click "Show Errors" button
2. Observe console output

**Expected Result**:
- Errors printed to console
- Error messages formatted correctly
- No error reporter crashes

**Actual Result**: ⏸️ PENDING

---

### 6.2 Event Handler Error Test

**Test Case**: Event handler errors don't crash plugin

**Steps**:
1. Force an event handler error (if possible)
2. Observe plugin behavior
3. Check console for error handler warnings

**Expected Result**:
- Plugin continues to function
- Console shows: `[AIStudio Events] Handler error: <error>`
- No plugin crash

**Actual Result**: ⏸️ PENDING

---

### 6.3 Network Error Test

**Test Case**: Network errors handled gracefully

**Prerequisites**: Backend server NOT running

**Steps**:
1. Attempt to connect
2. Observe error handling
3. Check console

**Expected Result**:
- Error reported via ErrorReporter
- Event fired: CONNECTION_FAILED
- Status updated with error message
- No plugin crash

**Actual Result**: ⏸️ PENDING

---

## 7. CLEANUP TEST

### 7.1 Plugin Unload Test

**Test Case**: Plugin unloads cleanly

**Steps**:
1. Connect to backend
2. Close Roblox Studio
3. Reopen Roblox Studio
4. Check for errors

**Expected Result**:
- Plugin unloads cleanly
- Console shows: `[AI Studio] Plugin unloaded.`
- No errors on reload
- Plugin loads again successfully

**Actual Result**: ⏸️ PENDING

---

### 7.2 Memory Leak Test

**Test Case**: No memory leaks on repeated operations

**Steps**:
1. Connect and disconnect 10 times
2. Sync project 10 times
3. Open and close widget 10 times
4. Monitor memory usage

**Expected Result**:
- Memory usage stable
- No significant memory increase
- No memory leak warnings

**Actual Result**: ⏸️ PENDING

---

## 8. EVENT TEST

### 8.1 Event Firing Test

**Test Case**: Events fire correctly

**Steps**:
1. Connect to backend
2. Check console for STUDIO_CONNECTED event
3. Disconnect from backend
4. Check console for STUDIO_DISCONNECTED event
5. Sync project
6. Check console for PROJECT_SYNC_COMPLETED event

**Expected Result**:
- All events fire at correct times
- Event payloads contain correct data
- Console logs all events

**Actual Result**: ⏸️ PENDING

---

### 8.2 Event Handler Test

**Test Case**: Event handlers execute correctly

**Steps**:
1. Connect to backend
2. Observe UI updates (status, session)
3. Sync project
4. Observe UI updates (sync label)

**Expected Result**:
- UI updates correctly on events
- Event handlers execute in correct order
- No handler errors

**Actual Result**: ⏸️ PENDING

---

## 9. TEST SUMMARY

### 9.1 Test Categories

**Loading Tests**: 3
- Plugin load test
- Module load test
- Initialization test

**Connection Tests**: 5
- Connect test
- Disconnect test
- Connection failure test
- Reconnect test
- Heartbeat test

**Sync Tests**: 4
- Sync success test
- Sync empty project test
- Sync failure test
- Sync without connection test

**UI Tests**: 7
- Widget open test
- Widget close test
- Button test
- Status label test
- Session label test
- Sync label test
- Generate button test

**Error Handling Tests**: 3
- Error reporter test
- Event handler error test
- Network error test

**Cleanup Tests**: 2
- Plugin unload test
- Memory leak test

**Event Tests**: 2
- Event firing test
- Event handler test

**Total Test Cases**: 26

---

### 9.2 Test Execution Status

**Completed**: 0
**Passed**: 0
**Failed**: 0
**Pending**: 26

---

### 9.3 Test Execution Log

**Date**: ⏸️ PENDING
**Tester**: ⏸️ PENDING
**Environment**: ⏸️ PENDING
**Results**: ⏸️ PENDING

---

## 10. RISK ASSESSMENT

### 10.1 High Risk Areas

**None Identified**

### 10.2 Medium Risk Areas

**Event System Integration**:
- **Risk**: Event handlers may not fire correctly
- **Mitigation**: Comprehensive event testing
- **Risk Level**: MEDIUM

**Network Reliability**:
- **Risk**: Network errors may cause plugin instability
- **Mitigation**: Error handling and reconnection logic
- **Risk Level**: MEDIUM

### 10.3 Low Risk Areas

**RuntimeValidator Unused**:
- **Risk**: Unused code
- **Mitigation**: Remove or integrate later
- **Risk Level**: LOW

**Generate Button Stub**:
- **Risk**: Button does nothing
- **Mitigation**: Expected for current version
- **Risk Level**: LOW

---

## 11. NEXT STEPS

### 11.1 Immediate

1. **Execute Tests**: Run all test cases in Roblox Studio
2. **Document Results**: Record actual results for each test
3. **Fix Issues**: Address any failures found

### 11.2 After Testing

1. **Delete Legacy Files**: If all tests pass
2. **Update Documentation**: Update plugin documentation
3. **Commit Changes**: Commit merged plugin to git

---

**Test Plan Status**: ✅ COMPLETE
**Test Execution**: ⏸️ READY
**Next Phase**: Phase 2.5.G - Roblox Studio Integration Testing
**Owner**: Architecture Team
