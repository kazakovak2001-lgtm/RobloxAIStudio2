# Autonomous Pipeline Real-Time Architecture

## Overview

The Autonomous Pipeline executes 11 phases to generate a complete Roblox experience from a single prompt. It integrates with the workspace real-time infrastructure via Socket.IO for live progress visualization.

## Event Flow

```
AutonomousOrchestrator.run()
  → PipelineEventEmitter.emitPipelineStarted()
  → [Phase Loop]
    → emitStepStarted(sessionId, stepId, agentName, projectId)
    → executePhase()
    → emitStepCompleted(sessionId, stepId, agentName, output+cost, projectId)
  → emitPipelineCompleted(sessionId, outputs, projectId)

PipelineEventEmitter
  → Socket.IO Bridge (server/src/index.ts events.onEvent handler)
    → io.to(`project:${projectId}`).emit(eventName, payload)

Frontend (Socket.IO client)
  → usePipelineStream hook
    → socket.on("step.started") → AgentBoard
    → socket.on("step.completed") → AgentBoard + CostMonitor
    → socket.on("step.failed") → AgentBoard
    → socket.on("pipeline.started") → PipelineStatusBar
    → socket.on("pipeline.completed") → PipelineStatusBar
    → socket.on("pipeline.failed") → PipelineStatusBar
```

## Transport Layer

- **Primary**: Socket.IO (real-time, < 50ms latency)
- **Fallback**: HTTP polling (2s when disconnected, 10s when connected)
- **SSE**: Available via StreamingUpdateHandler but not primary for workspace

## Phase → Agent Mapping

| Phase               | Agent Name           | stepId                   |
| ------------------- | -------------------- | ------------------------ |
| genre_detection     | Genre Detector       | auto-genre_detection     |
| knowledge_search    | Knowledge Search     | auto-knowledge_search    |
| blueprint           | Blueprint Generator  | auto-blueprint           |
| agent_collaboration | Agent Collaboration  | auto-agent_collaboration |
| lua_generation      | Lua Generator        | auto-lua_generation      |
| asset_generation    | Asset Generator      | auto-asset_generation    |
| experience_assembly | Experience Assembler | auto-experience_assembly |
| playtest            | Playtest Runner      | auto-playtest            |
| repair              | Repair Engine        | auto-repair              |
| benchmark           | Benchmark Analyzer   | auto-benchmark           |
| studio_sync         | Studio Sync          | auto-studio_sync         |

## Error States

- Phase failure → step.failed + pipeline.failed emitted
- Budget exceeded → step.failed (budget message) + pipeline.failed
- Session lost (404) → panel stops polling, shows recovery message
- Socket disconnection → polling fallback activates (2s interval)

## Component Integration

- **AgentBoard**: Receives autonomous agents via usePipelineStream state.agents
- **PipelineStatusBar**: Shows status via usePipelineStream state.status
- **CostMonitor**: Displays per-phase cost from AgentState.cost/tokens
- **AutonomousPipelinePanel**: Phase timeline + controls + Socket.IO primary + polling fallback

## Testing

- Exploration tests: 6 tests confirming bugs were detected and fixed
- Preservation tests: 26 tests ensuring existing pipeline behavior unchanged
- Integration tests: 9 end-to-end scenarios
- Total: 41 tests covering the integration
