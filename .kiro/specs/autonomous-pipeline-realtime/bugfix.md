# Bugfix Requirements Document

## Introduction

The Autonomous Pipeline (`AutonomousOrchestrator`) is completely disconnected from the workspace real-time infrastructure. It processes 11 phases internally but never emits events via `PipelineEventEmitter`, relying solely on an in-memory session polled every 2 seconds by `AutonomousPipelinePanel`. This means all Socket.IO-consuming workspace components — AgentBoard, PipelineStatusBar, CostMonitor — show nothing during autonomous execution. Additionally, `usePipelineStream` lacks a `step.failed` subscription, and the polling frontend has no graceful handling for session-lost (404) responses.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the AutonomousOrchestrator executes phases THEN the system does not emit any Socket.IO events because `PipelineEventEmitter` is never injected or called within `AutonomousOrchestrator.executePhases()`

1.2 WHEN an autonomous pipeline is running THEN the AgentBoard shows zero agents because no `step.started` or `step.completed` events are emitted for autonomous phases

1.3 WHEN an autonomous pipeline is running THEN the PipelineStatusBar remains in "Idle" state because no `pipeline.started` event is emitted for autonomous sessions

1.4 WHEN an autonomous pipeline is running THEN the CostMonitor displays $0.00 because per-phase cost/token data is never propagated via Socket.IO events

1.5 WHEN a `step.failed` event is emitted via Socket.IO THEN `usePipelineStream` does not process it because there is no subscription for the `step.failed` event in the hook

1.6 WHEN the autonomous session polling endpoint returns HTTP 404 (session lost/expired) THEN the AutonomousPipelinePanel continues polling indefinitely without notifying the user or transitioning to an error state

1.7 WHEN a user views the workspace without opening the AutonomousPipelinePanel THEN autonomous pipeline progress is completely invisible because Socket.IO is not used as a transport

### Expected Behavior (Correct)

2.1 WHEN the AutonomousOrchestrator executes phases THEN the system SHALL emit standard pipeline events (`pipeline.started`, `step.started`, `step.completed`, `step.failed`, `pipeline.completed`, `pipeline.failed`) via `PipelineEventEmitter` for each phase transition

2.2 WHEN an autonomous pipeline is running THEN the AgentBoard SHALL display each autonomous phase as an agent entry with real-time status updates (running, completed, failed) by mapping `ExecutionNode[]` to `AgentState[]`

2.3 WHEN an autonomous pipeline is running THEN the PipelineStatusBar SHALL reflect the autonomous pipeline state (running, current phase name, progress percentage) via Socket.IO events

2.4 WHEN an autonomous pipeline is running THEN the CostMonitor SHALL display per-phase cost, token count, and duration data propagated through Socket.IO events

2.5 WHEN a `step.failed` event is received via Socket.IO THEN `usePipelineStream` SHALL update the corresponding agent state to "failed" with the error message, matching the behavior of `step.started` and `step.completed` subscriptions

2.6 WHEN the autonomous session polling endpoint returns HTTP 404 THEN the AutonomousPipelinePanel SHALL stop polling, transition to a "session lost" error state, and display a user-facing notification

2.7 WHEN an autonomous pipeline is active THEN Socket.IO SHALL be the primary real-time transport, with HTTP polling retained only as a fallback when the socket connection is unavailable

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a non-autonomous pipeline (GameGenerationService, PlanExecutor) executes THEN the system SHALL CONTINUE TO emit events via PipelineEventEmitter and bridge them to Socket.IO exactly as before

3.2 WHEN a non-autonomous pipeline is running THEN the AgentBoard, PipelineStatusBar, and CostMonitor SHALL CONTINUE TO display agent progress, pipeline status, and cost data unchanged

3.3 WHEN `usePipelineStream` receives `pipeline.started`, `step.started`, `step.completed`, `pipeline.completed`, or `pipeline.failed` events THEN the hook SHALL CONTINUE TO process them with identical state transitions as before

3.4 WHEN the Socket.IO bridge in `server/src/index.ts` receives events from PipelineEventEmitter THEN it SHALL CONTINUE TO forward all existing event types (`evaluation.*`, `memory.*`, `planning.*`, `generation.*`, `assembly.*`, etc.) unchanged

3.5 WHEN multiple workspace components subscribe to the same Socket.IO events THEN the system SHALL CONTINUE TO deliver events without duplication or introducing a parallel event architecture

3.6 WHEN the AutonomousPipelinePanel is opened during an active run THEN it SHALL CONTINUE TO display the phase timeline, controls (pause/resume/cancel), and cost data as it currently does via polling fallback

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PipelineExecution
  OUTPUT: boolean

  // Returns true when the pipeline execution is an autonomous orchestrator run
  RETURN X.source = "AutonomousOrchestrator"
END FUNCTION
```

## Property Specification

```pascal
// Property: Fix Checking — Autonomous pipelines emit real-time events
FOR ALL X WHERE isBugCondition(X) DO
  result ← executeAutonomousPipeline'(X)
  ASSERT eventsEmitted(result, ["pipeline.started", "step.started", "step.completed", "pipeline.completed"]) = true
  ASSERT agentBoardPopulated(result) = true
  ASSERT costMonitorUpdated(result) = true
  ASSERT pipelineStatusBarReflectsState(result) = true
END FOR
```

```pascal
// Property: Preservation Checking — Non-autonomous pipelines unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```
