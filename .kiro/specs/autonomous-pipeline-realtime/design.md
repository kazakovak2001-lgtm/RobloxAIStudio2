# Autonomous Pipeline Real-Time Events — Bugfix Design

## Overview

The `AutonomousOrchestrator` executes 11 phases sequentially but never emits events via the existing `PipelineEventEmitter`. This means the workspace Socket.IO consumers (`AgentBoard`, `PipelineStatusBar`, `CostMonitor`) remain dark during autonomous runs. The fix injects `PipelineEventEmitter` into `AutonomousOrchestrator` so that each autonomous phase emits standard pipeline events, reusing the existing Socket.IO bridge in `server/src/index.ts` without creating a parallel event system. Additionally, `usePipelineStream` is missing a `step.failed` subscription and `AutonomousPipelinePanel` has no session-lost (404) handling.

## Glossary

- **Bug_Condition (C)**: The execution source is `AutonomousOrchestrator` — these pipelines never emit events to the real-time infrastructure
- **Property (P)**: Autonomous phases emit standard `PipelineEvent` types via `PipelineEventEmitter`, populating all workspace consumers in real time
- **Preservation**: All existing non-autonomous pipelines (`GameGenerationService`, `PlanExecutor`) continue to emit and bridge events identically; no second event system is introduced
- **PipelineEventEmitter**: The class in `server/src/socket/streaming.ts` that accepts `PipelineEvent` objects and dispatches them to registered handlers (including the Socket.IO bridge)
- **Socket.IO Bridge**: The `events.onEvent(...)` handler in `server/src/index.ts` that forwards `PipelineEvent` → Socket.IO room emissions
- **ExecutionNode**: An entry in `OrchestratorSession.phases[]` representing one autonomous phase with status, cost, and timing data
- **AgentState**: Frontend type (`src/features/workspace/types/index.ts`) representing a single agent's display state in `AgentBoard`

## Bug Details

### Bug Condition

The bug manifests when the `AutonomousOrchestrator` executes phases. The class never receives a `PipelineEventEmitter` instance and never calls `.emit()`, so the existing Socket.IO bridge has nothing to forward for autonomous runs.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type PipelineExecution
  OUTPUT: boolean

  RETURN input.source = "AutonomousOrchestrator"
         AND input.phases.length > 0
         AND NOT eventsEmittedViaPipelineEventEmitter(input)
END FUNCTION
```

### Examples

- **Phase start not visible**: `genre_detection` begins → no `step.started` event → AgentBoard shows 0 agents
- **Phase completion invisible**: `lua_generation` completes with cost $0.001 → no `step.completed` event → CostMonitor stays at $0.00
- **Phase failure not propagated**: `playtest` throws → no `step.failed` event → `usePipelineStream` never transitions agent to "failed"
- **Pipeline start not announced**: Session starts → no `pipeline.started` → PipelineStatusBar stays "Idle"
- **step.failed unhandled**: Backend emits `step.failed` (for any pipeline) → `usePipelineStream` has no listener → state not updated
- **Session lost (404)**: Session expires → polling returns 404 → `AutonomousPipelinePanel` continues polling indefinitely

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- `GameGenerationService` and `PlanExecutor` pipelines continue emitting events through `PipelineEventEmitter` → Socket.IO bridge identically
- The Socket.IO bridge in `server/src/index.ts` (`events.onEvent(...)`) does NOT require structural changes — autonomous events flow through the same `switch` cases (`pipeline.started`, `step.started`, `step.completed`, `step.failed`, `pipeline.completed`, `pipeline.failed`)
- `usePipelineStream` existing handlers for `pipeline.started`, `step.started`, `step.completed`, `pipeline.completed`, `pipeline.failed` continue to work unchanged for non-autonomous pipelines
- No new Socket.IO event names are introduced
- No parallel/duplicate event system is created
- `AutonomousPipelinePanel` polling fallback continues to work when Socket.IO is disconnected

**Scope:**
All inputs where `source ≠ "AutonomousOrchestrator"` are completely unaffected. This includes:

- Normal game generation via `GameGenerationService`
- Plan-based execution via `PlanExecutor`
- Evaluation, memory, planning, and assembly events
- Studio bridge events

## Hypothesized Root Cause

Based on the architecture analysis, the root causes are:

1. **No DI of PipelineEventEmitter**: `AutonomousOrchestrator` is instantiated in `server/src/routes/autonomous.ts` as `new AutonomousOrchestrator()` — the `events` (PipelineEventEmitter) singleton is never passed in. The constructor accepts no parameters.

2. **No emit calls in executePhases()**: The `executePhases` method updates `session.phases[].status` but never calls `events.emit()`, `events.emitStepStarted()`, etc.

3. **Missing step.failed subscription**: `usePipelineStream` subscribes to `pipeline.started`, `step.started`, `step.completed`, `pipeline.completed`, `pipeline.failed` but NOT `step.failed`.

4. **No 404 handling in polling**: `AutonomousPipelinePanel.startPolling()` calls `getAutonomousStatus(sid)` on an interval but only checks `res.success && res.data` — a 404 response just silently fails without stopping the interval or notifying the user.

5. **Autonomous route creates its own orchestrator**: `createAutonomousRouter()` uses `const orchestrator = new AutonomousOrchestrator()` — a module-local instance with no access to the shared `events` singleton from `server/src/index.ts`.

## Correctness Properties

Property 1: Bug Condition - Autonomous Phases Emit Pipeline Events

_For any_ autonomous pipeline execution where `AutonomousOrchestrator.executePhases()` processes a phase, the fixed function SHALL emit the corresponding `PipelineEvent` via `PipelineEventEmitter`: `pipeline.started` at run start, `step.started` when a phase begins, `step.completed` (with cost/token data) when a phase succeeds, `step.failed` when a phase fails, and `pipeline.completed`/`pipeline.failed` at session end.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-Autonomous Pipeline Behavior Unchanged

_For any_ pipeline execution where the source is NOT `AutonomousOrchestrator` (i.e., `GameGenerationService` or `PlanExecutor`), the fixed code SHALL produce exactly the same event emissions, Socket.IO messages, and frontend state transitions as the original code, preserving all existing real-time workspace behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Data Flow Diagram (Text-Based)

```
┌─────────────────────────────────────┐
│   AutonomousOrchestrator            │
│   (receives PipelineEventEmitter)   │
│                                     │
│   executePhases() loop:             │
│     ┌──────────────────────┐        │
│     │ phase start          │        │
│     │ → emitStepStarted()  │────────┼───┐
│     │ phase complete       │        │   │
│     │ → emitStepCompleted()│────────┼───┤
│     │ phase failed         │        │   │
│     │ → emitStepFailed()   │────────┼───┤
│     └──────────────────────┘        │   │
│                                     │   │
│   run():                            │   │
│     → emitPipelineStarted()─────────┼───┤
│   end (success/fail):               │   │
│     → emitPipelineCompleted/Failed()┼───┤
└─────────────────────────────────────┘   │
                                          │
                                          ▼
┌─────────────────────────────────────────────┐
│   PipelineEventEmitter (singleton)          │
│   server/src/socket/streaming.ts            │
│   - calls registered handlers               │
│   - broadcasts via StreamingUpdateHandler   │
└──────────────────┬──────────────────────────┘
                   │ events.onEvent(handler)
                   ▼
┌─────────────────────────────────────────────┐
│   Socket.IO Bridge (server/src/index.ts)    │
│   - switch(evt.type) → io.to(room).emit()  │
│   - Existing cases already handle:          │
│     pipeline.started, step.started,         │
│     step.completed, step.failed,            │
│     pipeline.completed, pipeline.failed     │
└──────────────────┬──────────────────────────┘
                   │ Socket.IO
                   ▼
┌─────────────────────────────────────────────┐
│   Frontend (src/features/workspace)         │
│   usePipelineStream.ts                      │
│     - socket.on("step.started")  → AgentBoard│
│     - socket.on("step.completed")→ AgentBoard│
│     - socket.on("step.failed")   → AgentBoard│  ← NEW subscription
│     - socket.on("pipeline.*")    → StatusBar │
│   CostMonitor receives cost from AgentState  │
│   AutonomousPipelinePanel: Socket primary,   │
│     polling fallback + 404 handling          │
└─────────────────────────────────────────────┘
```

### Phase → Agent Name Mapping Table

| OrchestratorPhase   | Agent Display Name   | stepId Format              |
| ------------------- | -------------------- | -------------------------- |
| genre_detection     | Genre Detector       | `auto-genre_detection`     |
| knowledge_search    | Knowledge Search     | `auto-knowledge_search`    |
| blueprint           | Blueprint Generator  | `auto-blueprint`           |
| agent_collaboration | Agent Collaboration  | `auto-agent_collaboration` |
| lua_generation      | Lua Generator        | `auto-lua_generation`      |
| asset_generation    | Asset Generator      | `auto-asset_generation`    |
| experience_assembly | Experience Assembler | `auto-experience_assembly` |
| playtest            | Playtest Runner      | `auto-playtest`            |
| repair              | Repair Engine        | `auto-repair`              |
| benchmark           | Benchmark Analyzer   | `auto-benchmark`           |
| studio_sync         | Studio Sync          | `auto-studio_sync`         |

### Changes Required

**File**: `server/src/orchestrator/AutonomousOrchestrator.ts`

**Changes**:

1. **Add constructor parameter**: Accept optional `PipelineEventEmitter` instance
2. **Emit `pipeline.started`**: At the start of `run()`, after session creation
3. **Emit `step.started`**: In `executePhases()` when `node.status` transitions to `"running"`
4. **Emit `step.completed`**: In `executePhases()` after phase succeeds, include cost/token data in `evt.data`
5. **Emit `step.failed`**: In `executePhases()` catch block when a phase throws
6. **Emit `pipeline.completed`**: When all phases finish successfully
7. **Emit `pipeline.failed`**: When a phase failure terminates the session
8. **Map phase → agent name**: Use the mapping table above for `data.name` in step events

**Event Payload Structure**:

```typescript
// step.started payload (data field)
{ name: "Lua Generator", phase: "lua_generation" }

// step.completed payload (data field)
{ name: "Lua Generator", phase: "lua_generation", output: {...},
  cost: { tokens: 342, cost: 0.000684, timeMs: 200 } }

// step.failed payload (data field)
{ name: "Playtest Runner", phase: "playtest", error: "Budget exceeded" }

// pipeline.started payload — uses session.id as pipelineId
// pipeline.completed payload (data field)
{ outputs: { qualityScore: 85, genre: "simulator", totalCost: 0.0045 } }

// pipeline.failed payload (data field)
{ error: "Budget or time limit exceeded", failedStepId: "auto-playtest",
  failedAgentId: "Playtest Runner", completedSteps: 7 }
```

---

**File**: `server/src/routes/autonomous.ts`

**Changes**:

1. **Accept `PipelineEventEmitter` parameter**: Change `createAutonomousRouter()` to accept `events: PipelineEventEmitter`
2. **Pass to constructor**: `new AutonomousOrchestrator(events)`

---

**File**: `server/src/index.ts`

**Changes**:

1. **Pass events to autonomous router**: Change `createAutonomousRouter()` → `createAutonomousRouter(events)`

No structural changes needed to the bridge — it already handles `step.started`, `step.completed`, `step.failed`, `pipeline.started`, `pipeline.completed`, `pipeline.failed`.

---

**File**: `src/features/workspace/hooks/usePipelineStream.ts`

**Changes**:

1. **Add `step.failed` subscription**: Subscribe to `socket.on("step.failed", onStepFailed)` that transitions the matching agent to `status: "failed"` with the error message
2. **Include cost data in AgentState**: When `step.completed` arrives with `data.cost`, update `AgentState.tokens` and `AgentState.cost`

```typescript
// New handler
const onStepFailed = (
  payload: GenerationProgressEvent & { error?: string },
) => {
  setState((prev) => {
    if (!prev) return prev;
    const updatedAgents: AgentState[] = prev.agents.map((item) =>
      item.id === payload.agentId
        ? { ...item, status: "failed", progress: 0, finishedAt: new Date() }
        : item,
    );
    return { ...prev, agents: updatedAgents };
  });
  appendEvent("step.failed", payload as unknown as Record<string, unknown>);
};
```

---

**File**: `src/features/workspace/components/AutonomousPipelinePanel.tsx`

**Changes**:

1. **Handle 404 in polling**: When `getAutonomousStatus` response is not successful and HTTP status is 404, stop polling and transition to a "session lost" error state
2. **Add Socket.IO as primary transport**: Subscribe to pipeline events via `usePipelineStream` so updates arrive immediately; keep polling as a fallback only when `isConnected === false`
3. **Debounce duplicate state updates**: If Socket.IO and polling both provide data, prefer Socket.IO and reduce polling interval (e.g., 10s instead of 2s)

```typescript
// 404 handling in startPolling callback
const res = await getAutonomousStatus(sid);
if (!res.success) {
  // Session lost — API returned 404 or other error
  stopPolling();
  setError("Session lost — the autonomous run may have expired.");
  setState("failed");
  return;
}
```

---

### Modified Files Summary

| File                                                            | Change Type       | Description                                                       |
| --------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `server/src/orchestrator/AutonomousOrchestrator.ts`             | Modified          | Accept `PipelineEventEmitter`, emit events during phase execution |
| `server/src/routes/autonomous.ts`                               | Modified          | Accept and forward `PipelineEventEmitter`                         |
| `server/src/index.ts`                                           | Modified (1 line) | Pass `events` to `createAutonomousRouter(events)`                 |
| `src/features/workspace/hooks/usePipelineStream.ts`             | Modified          | Add `step.failed` subscription, propagate cost data               |
| `src/features/workspace/components/AutonomousPipelinePanel.tsx` | Modified          | Add 404 handling, Socket.IO primary transport                     |
| `src/shared/events/index.ts`                                    | Unchanged         | Already declares `step.failed` in `ServerToClientEvents`          |
| `server/src/socket/streaming.ts`                                | Unchanged         | `PipelineEventEmitter` already has all needed methods             |
| `server/src/execution/pipelineTypes.ts`                         | Unchanged         | `step.failed` already in `PipelineEventType` union                |

### New Files

No new files required. The fix reuses existing infrastructure exclusively.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write integration tests that start an autonomous run and listen on Socket.IO for pipeline/step events. Run these tests on the UNFIXED code to observe that no events arrive.

**Test Cases**:

1. **No pipeline.started emitted**: Start autonomous run → listen for `pipeline.started` on Socket.IO → expect TIMEOUT (will fail on unfixed code)
2. **No step.started emitted**: Start autonomous run → listen for `step.started` during genre_detection phase → expect TIMEOUT (will fail on unfixed code)
3. **No step.completed with cost**: Start autonomous run → wait for any `step.completed` with `data.cost` field → expect TIMEOUT (will fail on unfixed code)
4. **step.failed not handled by frontend**: Emit a manual `step.failed` event → verify `usePipelineStream` state does not update agent to "failed" (will fail on unfixed code)
5. **404 not handled**: Call `getAutonomousStatus("nonexistent")` → verify panel still polls indefinitely (will fail on unfixed code)

**Expected Counterexamples**:

- Socket.IO listeners receive zero events during autonomous execution
- `usePipelineStream` state.agents remains empty throughout autonomous run
- Possible causes confirmed: no DI of PipelineEventEmitter, no emit calls in executePhases

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (autonomous pipelines), the fixed function produces standard pipeline events.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := executeAutonomousPipeline_fixed(input)
  ASSERT eventSequenceCorrect(result):
    pipeline.started emitted once at start
    step.started emitted once per non-skipped phase
    step.completed emitted for each successful phase (with cost data)
    step.failed emitted for failing phase (with error)
    pipeline.completed OR pipeline.failed emitted once at end
  ASSERT agentBoardPopulated(result):
    AgentState[] contains entries for each phase with correct name mapping
  ASSERT costMonitorUpdated(result):
    AgentState.cost reflects per-phase cost from step.completed data
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (normal pipelines), the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalPipeline(input) = fixedPipeline(input)
  // Specifically:
  ASSERT sameEventsEmitted(originalPipeline(input), fixedPipeline(input))
  ASSERT sameSocketIOMessages(originalPipeline(input), fixedPipeline(input))
  ASSERT sameFrontendState(originalPipeline(input), fixedPipeline(input))
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (different project IDs, step counts, agent names)
- It catches edge cases that manual unit tests might miss (empty pipelines, single-step pipelines, duplicate agent IDs)
- It provides strong guarantees that behavior is unchanged for all non-autonomous inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal pipelines (verify `GameGenerationService` events flow correctly), then write property-based tests capturing that behavior pattern.

**Test Cases**:

1. **Normal pipeline event flow preserved**: Verify `GameGenerationService.generate()` emits the same sequence of pipeline events before and after fix
2. **Socket.IO bridge unchanged**: Verify the bridge forwards normal pipeline events with identical payloads
3. **usePipelineStream existing handlers**: Verify `step.started` and `step.completed` produce the same `AgentState` mutations for non-autonomous agents
4. **No duplicate events**: Verify that autonomous pipeline events do not interfere with or duplicate normal pipeline events

### Unit Tests

- Test `AutonomousOrchestrator` emits correct event sequence for a successful 3-phase run
- Test `AutonomousOrchestrator` emits `step.failed` + `pipeline.failed` when a phase throws
- Test `AutonomousOrchestrator` skips events for skipped phases (no `step.started`/`step.completed` for skipped)
- Test `AutonomousOrchestrator` with no `PipelineEventEmitter` (graceful no-op for backward compat)
- Test `usePipelineStream` `step.failed` handler updates agent state correctly
- Test `AutonomousPipelinePanel` stops polling and shows error on 404

### Property-Based Tests

- Generate random autonomous session configurations (varying phase counts, skip conditions, budget limits) and verify event emission invariants hold for all
- Generate random non-autonomous pipeline executions and verify identical event output before/after fix
- Generate random socket event sequences and verify `usePipelineStream` produces consistent state regardless of event interleaving

### Integration Tests

- End-to-end: POST `/api/autonomous/run` → verify Socket.IO client receives `pipeline.started` within 100ms
- End-to-end: Full autonomous run → verify AgentBoard renders 11 phases with correct status transitions
- End-to-end: Inject phase failure → verify `step.failed` arrives at frontend and agent shows red
- End-to-end: Run normal pipeline concurrently with autonomous → verify no event cross-contamination
- End-to-end: Kill session mid-run → verify 404 handling in panel transitions to error state

## Risks and Mitigation

| Risk                                                                       | Impact                                                             | Mitigation                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `PipelineEventEmitter.emit()` is async — adds latency to phase transitions | Low: emit is fire-and-forget; phases are already 50-200ms          | Keep emit calls non-blocking (don't await in hot path if unnecessary)              |
| Autonomous `pipelineId` collides with normal pipeline IDs                  | Medium: could cause UI state corruption                            | Use `session.id` (format: `orch-*`) which is guaranteed unique and distinguishable |
| Rapid phase transitions flood Socket.IO                                    | Low: 11 phases max, each 40-200ms apart                            | No mitigation needed; well within Socket.IO throughput                             |
| `usePipelineStream` state grows unbounded with many agents                 | Low: max 11 autonomous agents per run                              | Existing `events.slice(-200)` cap suffices                                         |
| Breaking change if `PipelineEventEmitter` API changes                      | Low: we use existing public methods only (`emitStepStarted`, etc.) | Type-checked at compile time                                                       |
| Polling + Socket.IO race condition (duplicate state updates)               | Medium: could cause flicker                                        | Socket.IO is authoritative; polling only fills gaps when disconnected              |
