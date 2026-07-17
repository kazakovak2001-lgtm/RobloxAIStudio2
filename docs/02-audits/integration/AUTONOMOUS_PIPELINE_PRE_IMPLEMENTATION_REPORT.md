# Autonomous Pipeline Pre-Implementation Report

**Date**: July 15, 2026  
**Task**: F-6 Pre-Implementation Analysis  
**Status**: COMPLETE — Ready for implementation

---

## Key Findings

| Question              | Answer                                                            |
| --------------------- | ----------------------------------------------------------------- |
| Backend API exists?   | ✅ YES — 5 endpoints at /api/autonomous/*                         |
| Execution model?      | **Asynchronous** — fire-and-forget with status polling            |
| WebSocket needed?     | ❌ NO for v1 — polling /status/:sessionId is sufficient           |
| State machine?        | ✅ YES — 14 phases with skip/pause/resume/cancel                  |
| Persistent storage?   | ❌ NO — InMemory Map (matches project storage pattern)            |
| Human approval gates? | ❌ NO explicit gate — but pause/resume enables manual checkpoints |
| Failure handling?     | ✅ Budget/time limits + per-phase error catching                  |
| Session recovery?     | ✅ pause → resume continues from next pending phase               |

---

## Backend Capabilities

### Endpoints

| Endpoint                          | Method | Purpose                                         |
| --------------------------------- | ------ | ----------------------------------------------- |
| /api/autonomous/run               | POST   | Start autonomous generation (returns sessionId) |
| /api/autonomous/status/:sessionId | GET    | Poll session status + phases                    |
| /api/autonomous/pause/:sessionId  | POST   | Pause execution                                 |
| /api/autonomous/resume/:sessionId | POST   | Resume from last pending phase                  |
| /api/autonomous/cancel/:sessionId | POST   | Cancel execution                                |

### Phase Pipeline (11 phases)

```
genre_detection → knowledge_search → blueprint → agent_collaboration →
lua_generation → asset_generation → experience_assembly → playtest →
repair → benchmark → studio_sync → completed
```

### Session State Machine

```
pending → running → completed
                  → failed (budget exceeded / phase error)
                  → paused (user action) → running (resume)
                  → cancelled (user action)
```

### Smart Features

- **Phase skipping**: repair skipped if quality ≥ target; studio_sync skipped if quality < 50
- **Budget enforcement**: auto-fail if time or cost limits exceeded
- **Cost tracking**: per-phase token/cost/time breakdown
- **Checkpoints**: snapshot after each phase
- **Genre detection**: auto-classifies prompt into game genre

### Response Shape — GET /status/:sessionId

```typescript
OrchestratorSession {
  id, projectId, prompt, status, currentPhase,
  phases: ExecutionNode[] (per-phase status + output + timing),
  goals: GoalConfig,
  cost: CostTracker (totalTokens, totalCost, totalTimeMs, perPhase),
  checkpoints: Checkpoint[],
  qualityScore, startedAt, finishedAt?,
  genre?, estimatedTimeMs?, estimatedCost?
}
```

---

## Architecture Decision: **Workspace Panel** (v1)

**Reasoning**:

- Autonomous Pipeline produces output FOR a project → belongs in Workspace
- User watches progress in context of their current project
- SimulationPanel and EconomyPanel set the established pattern
- Polling (2s interval) is sufficient for v1 — no WebSocket needed

**Location**: Middle column, after EconomyPanel, before ArtifactExplorer

**Why NOT a standalone page**:

- Autonomous runs are per-project (not cross-project like Knowledge Base)
- User needs to see pipeline results alongside artifacts and simulation

---

## Implementation Plan

### Files

| File                                                    | Action                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `src/services/autonomousApi.ts`                         | CREATE — 5 functions (run, getStatus, pause, resume, cancel) |
| `src/features/workspace/components/AutonomousPanel.tsx` | CREATE — with phase timeline + progress                      |
| `src/features/workspace/Workspace.tsx`                  | MODIFY — add panel                                           |
| `src/services/__tests__/autonomousApi.test.ts`          | CREATE                                                       |

### UI Design

```
AutonomousPanel
├── Header: "Autonomous Generation" + Start/Pause/Resume/Cancel buttons
├── Prompt display (what was submitted)
├── Phase Timeline (11 items with status icons: ✅/⏳/⏹/⚠️/⏭)
├── Current Phase highlight
├── Quality Score (progress bar toward target)
├── Cost tracker (tokens, $, time)
├── Genre badge (auto-detected)
├── Estimated time remaining
└── Error/completion state
```

### States

- **idle**: Input field + "Start" button
- **running**: Phase timeline + progress + pause/cancel buttons
- **paused**: Timeline frozen + "Resume" button
- **completed**: Final score + cost summary + "Production Ready" if score ≥ target
- **failed**: Error message + retry
- **cancelled**: Status + cost spent

### Polling Strategy

- Poll `/status/:sessionId` every 2 seconds while status === "running"
- Stop polling on completed/failed/cancelled/paused
- Resume polling on user resume action

---

## Effort Estimate

| Task                                            | Effort       |
| ----------------------------------------------- | ------------ |
| Create autonomousApi.ts                         | 30 min       |
| Create AutonomousPanel.tsx (most complex panel) | 3 hours      |
| Modify Workspace.tsx                            | 15 min       |
| Tests                                           | 30 min       |
| Documentation                                   | 30 min       |
| **Total**                                       | **~5 hours** |

---

## Risks

| Risk                                 | Level  | Mitigation                                    |
| ------------------------------------ | ------ | --------------------------------------------- |
| Polling may miss rapid state changes | LOW    | 2s interval is fine for ~1min total execution |
| Long execution blocks UI             | LOW    | Async — user can navigate away and return     |
| Budget limit kills run unexpectedly  | MEDIUM | Show estimated cost/time before starting      |
| Many phases make timeline complex    | MEDIUM | Compact vertical timeline with icons          |

---

## Integration with Other Systems

| System             | Relationship                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ |
| Simulation (F-4)   | Autonomous runs playtest phase internally — results visible in session               |
| Economy (F-5)      | Not directly connected (economy is manual analysis)                                  |
| Knowledge (F-7)    | Autonomous uses knowledge_search phase internally                                    |
| Playtest (F-8)     | Autonomous runs playtest + repair phases                                             |
| Analytics          | Quality scores can feed into analytics (future)                                      |
| Workspace Pipeline | Autonomous is an ALTERNATIVE to manual pipeline — different entry point, same result |

---

## Definition of Done

- [ ] autonomousApi.ts (5 functions: run, getStatus, pause, resume, cancel)
- [ ] AutonomousPanel.tsx with all 6 states
- [ ] Phase timeline visualization (11 phases)
- [ ] Polling while running (2s interval)
- [ ] Pause/Resume/Cancel controls
- [ ] Quality score + cost tracking display
- [ ] Tests (7+ assertions)
- [ ] TypeScript PASS
- [ ] Vite PASS
- [ ] Documentation updated
