# Implementation Plan

## Overview

This plan fixes the autonomous pipeline real-time visibility bug using the bugfix exploration workflow: exploration tests first (confirm bugs exist), preservation tests (capture baseline), then incremental implementation with verification after each step.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Autonomous Phases Emit No Pipeline Events
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete autonomous pipeline executions — instantiate `AutonomousOrchestrator` and verify event emissions during `executePhases()`
  - Bug Condition: `isBugCondition(input)` where `input.source = "AutonomousOrchestrator" AND input.phases.length > 0 AND NOT eventsEmittedViaPipelineEventEmitter(input)`
  - Test that starting an autonomous run emits `pipeline.started` via `PipelineEventEmitter` (currently does NOT)
  - Test that executing a phase emits `step.started` with correct agent name mapping (currently does NOT)
  - Test that completing a phase emits `step.completed` with cost/token data (currently does NOT)
  - Test that a failing phase emits `step.failed` with error details (currently does NOT)
  - Test that `usePipelineStream` processes a `step.failed` Socket.IO event and updates agent state (currently does NOT — no subscription exists)
  - Test that `AutonomousPipelinePanel` stops polling on 404 response (currently does NOT — polls indefinitely)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bug exists)
  - Document counterexamples found: AutonomousOrchestrator constructor accepts no parameters, executePhases() never calls emit, usePipelineStream has no step.failed listener, panel ignores 404
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Autonomous Pipeline Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `GameGenerationService.generate()` emits `pipeline.started`, `step.started`, `step.completed`, `pipeline.completed` events with correct payloads on unfixed code
  - Observe: `PlanExecutor` emits the same standard event types on unfixed code
  - Observe: Socket.IO bridge in `server/src/index.ts` forwards all existing event types (`evaluation.*`, `memory.*`, `planning.*`, `generation.*`, `assembly.*`) unchanged
  - Observe: `usePipelineStream` handlers for `pipeline.started`, `step.started`, `step.completed`, `pipeline.completed`, `pipeline.failed` produce correct `AgentState[]` transitions
  - Observe: `AutonomousPipelinePanel` polling fallback displays phase timeline, controls, and cost data correctly
  - Write property-based test: for all non-autonomous pipeline executions (source ≠ "AutonomousOrchestrator"), the event sequence emitted by `PipelineEventEmitter` is identical before and after fix
  - Write property-based test: for all Socket.IO bridge event forwarding of non-autonomous events, payloads and room targeting are identical before and after fix
  - Write property-based test: for all `usePipelineStream` state transitions from `step.started`/`step.completed`/`pipeline.*` events, the resulting `AgentState[]` is identical before and after fix
  - Write property-based test: no duplicate events are introduced when autonomous and non-autonomous pipelines run concurrently
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Backend: Inject PipelineEventEmitter into AutonomousOrchestrator

  - [ ] 3.1 Modify AutonomousOrchestrator constructor to accept optional PipelineEventEmitter
    - Add `private events?: PipelineEventEmitter` parameter to constructor
    - Store reference for use in `executePhases()` and `run()`
    - Graceful no-op when `events` is undefined (backward compatibility)
    - _Bug_Condition: isBugCondition(input) where input.source = "AutonomousOrchestrator" AND constructor accepts no PipelineEventEmitter_
    - _Expected_Behavior: Constructor accepts PipelineEventEmitter instance, stores it for event emission_
    - _Preservation: Non-autonomous pipelines (GameGenerationService, PlanExecutor) are not affected — they already have their own PipelineEventEmitter injection_
    - _Requirements: 2.1_

  - [ ] 3.2 Update autonomous routes to pass PipelineEventEmitter
    - Change `createAutonomousRouter()` signature to accept `events: PipelineEventEmitter` parameter
    - Pass `events` to `new AutonomousOrchestrator(events)` in route handlers
    - _Bug_Condition: createAutonomousRouter() currently creates AutonomousOrchestrator with no args_
    - _Expected_Behavior: Router factory receives events singleton and forwards to orchestrator_
    - _Preservation: Route structure, endpoints, and request/response schemas remain unchanged_
    - _Requirements: 2.1_

  - [ ] 3.3 Update server/src/index.ts to pass events to createAutonomousRouter
    - Change `createAutonomousRouter()` call to `createAutonomousRouter(events)`
    - Single-line change — no structural modification to the Socket.IO bridge
    - _Bug_Condition: index.ts instantiates autonomous router without passing events singleton_
    - _Expected_Behavior: events singleton is passed through to autonomous router factory_
    - _Preservation: All existing event bridge handlers (evaluation.*, memory.*, planning.*, generation.*, assembly.\*) remain untouched_
    - _Requirements: 2.1_

- [ ] 4. Backend: Emit pipeline events during autonomous execution

  - [ ] 4.1 Emit pipeline.started at the start of run()
    - After session creation, call `this.events?.emit({ type: "pipeline.started", pipelineId: session.id, data: { ... } })`
    - Use `session.id` (format `orch-*`) as pipelineId to avoid collision with normal pipeline IDs
    - _Bug_Condition: run() creates session but never emits pipeline.started_
    - _Expected_Behavior: pipeline.started emitted once at run start with session.id as pipelineId_
    - _Preservation: Non-autonomous pipeline.started events continue to use their own pipelineId formats_
    - _Requirements: 2.1, 2.3_

  - [ ] 4.2 Emit step.started when a phase begins in executePhases()
    - When `node.status` transitions to `"running"`, emit `step.started` with mapped agent name from Phase→Agent Name table
    - Use stepId format `auto-{phase_name}` (e.g., `auto-lua_generation`)
    - Include `data.name` (e.g., "Lua Generator") and `data.phase` (e.g., "lua_generation")
    - Do NOT emit for skipped phases
    - _Bug_Condition: executePhases() updates node.status but never emits step.started_
    - _Expected_Behavior: step.started emitted once per non-skipped phase with correct agent name mapping_
    - _Preservation: Non-autonomous step.started events from GameGenerationService/PlanExecutor are unchanged_
    - _Requirements: 2.1, 2.2_

  - [ ] 4.3 Emit step.completed when a phase succeeds
    - After phase succeeds, emit `step.completed` with cost/token data: `{ name, phase, output, cost: { tokens, cost, timeMs } }`
    - Extract cost data from phase result (node.cost, node.tokens, node.duration)
    - _Bug_Condition: executePhases() completes phases but never emits step.completed with cost data_
    - _Expected_Behavior: step.completed emitted for each successful phase with cost/token/timing data_
    - _Preservation: Non-autonomous step.completed events continue with their existing payload structure_
    - _Requirements: 2.1, 2.4_

  - [ ] 4.4 Emit step.failed when a phase throws
    - In the catch block of executePhases(), emit `step.failed` with `{ name, phase, error: err.message }`
    - _Bug_Condition: executePhases() catch block updates session but never emits step.failed_
    - _Expected_Behavior: step.failed emitted when a phase throws, with error message_
    - _Preservation: Non-autonomous step.failed events (if any) are unchanged_
    - _Requirements: 2.1_

  - [ ] 4.5 Emit pipeline.completed or pipeline.failed at session end
    - When all phases finish successfully: emit `pipeline.completed` with `{ outputs: { qualityScore, genre, totalCost } }`
    - When a phase failure terminates session: emit `pipeline.failed` with `{ error, failedStepId, failedAgentId, completedSteps }`
    - _Bug_Condition: Session ends but no terminal pipeline event is emitted_
    - _Expected_Behavior: Exactly one terminal event (pipeline.completed OR pipeline.failed) emitted at session end_
    - _Preservation: Non-autonomous pipeline terminal events continue unchanged_
    - _Requirements: 2.1, 2.3_

- [ ] 5. Frontend: Add step.failed subscription to usePipelineStream

  - [ ] 5.1 Add step.failed Socket.IO handler in usePipelineStream
    - Subscribe to `socket.on("step.failed", onStepFailed)`
    - Handler transitions matching agent (`item.id === payload.agentId`) to `status: "failed"` with `progress: 0` and `finishedAt: new Date()`
    - Call `appendEvent("step.failed", payload)` for event log
    - Unsubscribe in cleanup: `socket.off("step.failed", onStepFailed)`
    - _Bug_Condition: usePipelineStream subscribes to step.started, step.completed but NOT step.failed_
    - _Expected_Behavior: step.failed events update corresponding agent state to "failed" with error message_
    - _Preservation: Existing step.started, step.completed, pipeline.\* handlers remain unchanged_
    - _Requirements: 2.5_

  - [ ] 5.2 Propagate cost data from step.completed to AgentState
    - When `step.completed` arrives with `data.cost`, update `AgentState.tokens` and `AgentState.cost`
    - Enables CostMonitor to display per-phase cost for autonomous runs
    - _Bug_Condition: step.completed handler does not extract cost/token data into AgentState_
    - _Expected_Behavior: AgentState.tokens and AgentState.cost populated from step.completed event data_
    - _Preservation: Non-autonomous step.completed events that already include cost data will also benefit (no regression)_
    - _Requirements: 2.4_

- [ ] 6. Frontend: AutonomousPipelinePanel improvements

  - [ ] 6.1 Handle 404 response in polling callback
    - When `getAutonomousStatus(sid)` returns unsuccessful with HTTP 404, stop polling interval
    - Transition panel to "session lost" error state
    - Display user-facing notification: "Session lost — the autonomous run may have expired."
    - _Bug_Condition: Polling callback only checks res.success && res.data — 404 silently fails without stopping interval_
    - _Expected_Behavior: 404 stops polling, transitions to error state, shows notification_
    - _Preservation: Successful polling responses (200) continue to update panel state as before_
    - _Requirements: 2.6_

  - [ ] 6.2 Add Socket.IO as primary transport with polling fallback
    - Subscribe to pipeline events via `usePipelineStream` hook for immediate updates
    - Keep HTTP polling as fallback only when `isConnected === false` (Socket.IO disconnected)
    - When Socket.IO is connected, increase polling interval from 2s to 10s (gap-filling only)
    - Socket.IO is authoritative when both provide data (prevents flicker from duplicate updates)
    - _Bug_Condition: Panel uses polling as sole transport — 2s delay, no real-time capability_
    - _Expected_Behavior: Socket.IO delivers immediate updates; polling fills gaps when socket is disconnected_
    - _Preservation: Polling fallback continues to display phase timeline, controls (pause/resume/cancel), and cost data when Socket.IO is unavailable_
    - _Requirements: 2.7, 3.6_

- [ ] 7. Frontend: Workspace integration verification

  - [ ] 7.1 Verify AgentBoard displays autonomous phases
    - Confirm autonomous pipeline events flow through `usePipelineStream` → `AgentState[]` → `AgentBoard` rendering
    - Each autonomous phase appears as an agent entry with mapped display name (e.g., "Lua Generator")
    - Real-time status updates: running → completed/failed
    - _Bug_Condition: AgentBoard shows zero agents during autonomous runs because no step events arrive_
    - _Expected_Behavior: AgentBoard displays each autonomous phase with real-time status updates_
    - _Preservation: Non-autonomous agents continue to display in AgentBoard unchanged_
    - _Requirements: 2.2_

  - [ ] 7.2 Verify PipelineStatusBar reflects autonomous state
    - Confirm `pipeline.started` event transitions status bar from "Idle" to running state
    - Current phase name and progress percentage visible
    - `pipeline.completed`/`pipeline.failed` transitions to terminal state
    - _Bug_Condition: PipelineStatusBar remains "Idle" during autonomous runs — no pipeline.started event_
    - _Expected_Behavior: StatusBar reflects running state, current phase, and progress_
    - _Preservation: Non-autonomous pipeline status transitions unchanged_
    - _Requirements: 2.3_

  - [ ] 7.3 Verify CostMonitor displays per-phase cost
    - Confirm `step.completed` events with cost data propagate through AgentState to CostMonitor
    - Per-phase cost, token count, and duration visible
    - Total cost accumulates across phases
    - _Bug_Condition: CostMonitor displays $0.00 during autonomous runs — no cost data propagated_
    - _Expected_Behavior: CostMonitor displays per-phase and cumulative cost data_
    - _Preservation: Non-autonomous cost data display unchanged_
    - _Requirements: 2.4_

- [ ] 8. Fix verification

  - [ ] 8.1 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Autonomous Phases Emit Pipeline Events
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 8.2 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Autonomous Pipeline Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all non-autonomous pipeline behavior is unchanged after fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 9. Integration tests — end-to-end verification

  - [ ] 9.1 Test full autonomous run event sequence
    - POST `/api/autonomous/run` → verify Socket.IO client receives `pipeline.started` within 100ms
    - Verify `step.started`/`step.completed` arrive for each phase with correct agent names
    - Verify `pipeline.completed` arrives at session end with quality score and total cost
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 9.2 Test phase failure propagation
    - Inject phase failure (e.g., budget exceeded in playtest) → verify `step.failed` arrives at frontend
    - Verify agent shows "failed" status in AgentBoard
    - Verify `pipeline.failed` includes `failedStepId` and `failedAgentId`
    - _Requirements: 2.1, 2.5_

  - [ ] 9.3 Test concurrent pipeline isolation
    - Run normal pipeline (`GameGenerationService`) concurrently with autonomous pipeline
    - Verify no event cross-contamination between pipeline IDs
    - Verify each pipeline's events arrive only in their respective Socket.IO rooms
    - _Requirements: 3.4, 3.5_

  - [ ] 9.4 Test session-lost 404 handling end-to-end
    - Start autonomous run → kill session server-side → verify panel receives 404
    - Verify polling stops and "session lost" error state is displayed
    - _Requirements: 2.6_

- [ ] 10. Documentation updates

  - [ ] 10.1 Update CURRENT_STATE.md
    - Document that autonomous pipelines now emit real-time events via PipelineEventEmitter
    - Note Socket.IO as primary transport for AutonomousPipelinePanel
    - _Requirements: 2.1, 2.7_

  - [ ] 10.2 Update ROADMAP_STATUS.md
    - Mark "Real-time autonomous pipeline visibility" as completed
    - Update progress percentage for workspace integration milestone
    - _Requirements: 2.1_

  - [ ] 10.3 Update DECISION_LOG.md
    - Log decision: Reuse existing PipelineEventEmitter + Socket.IO bridge (no parallel system)
    - Log decision: Socket.IO primary, polling fallback for AutonomousPipelinePanel
    - Log decision: Phase→Agent name mapping with `auto-` prefix for stepIds
    - _Requirements: 2.7, 3.5_

- [ ] 11. Checkpoint — Ensure all tests pass
  - Run full test suite (unit + integration)
  - Verify exploration tests (task 1) now pass
  - Verify preservation tests (task 2) still pass
  - Verify integration tests (task 9) pass
  - Confirm no regressions in existing test suite
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "tasks": ["1", "2"] },
    { "tasks": ["3"] },
    { "tasks": ["4", "5", "6"] },
    { "tasks": ["7", "8"] },
    { "tasks": ["9"] },
    { "tasks": ["10"] },
    { "tasks": ["11"] }
  ]
}
```

## Notes

- Tasks 1 and 2 MUST be completed before any implementation begins (tasks 3–6)
- Tasks 3–6 can be worked on in parallel after exploration/preservation tests are written
- Task 8 re-runs the SAME tests from tasks 1 and 2 — no new tests are written
- The fix reuses existing infrastructure exclusively — no new files, no new event types, no parallel event system
- Phase→Agent name mapping uses the table in design.md (11 phases → 11 display names)
- stepId format for autonomous phases: `auto-{phase_name}` to distinguish from normal pipeline step IDs
