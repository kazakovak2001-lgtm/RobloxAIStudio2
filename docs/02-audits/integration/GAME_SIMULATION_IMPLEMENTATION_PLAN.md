# Game Simulation Implementation Plan

**Date**: July 15, 2026  
**Task**: F-4 (Game Simulation Integration)  
**Status**: PRE-AUDIT COMPLETE — Ready for implementation

---

## 1. Backend API Analysis

### Available Endpoints (server/src/routes/simulation.ts)

| Endpoint                      | Method | Input                 | Output                                                            | Use Case                           |
| ----------------------------- | ------ | --------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| /api/simulate/game            | POST   | { blueprint, ticks? } | SimulationResult + PlaytestReport + Metrics + Feedback + Decision | Full simulation pipeline           |
| /api/simulate/run             | POST   | { blueprint, ticks? } | SimulationResult only                                             | Quick sim without analysis         |
| /api/simulate/metrics/:gameId | GET    | gameId param          | GameplayMetrics                                                   | Retrieve stored metrics            |
| /api/simulate/feedback        | POST   | { report, metrics }   | SimulationFeedback                                                | Generate feedback for existing sim |

### Key Types (from backend source)

```typescript
// Input
RobloxGameBlueprint { id, title, genre, mechanics: string[], npcs: Array<{id}>, ... }

// Output — POST /api/simulate/game response
{
  simulation: { ticks: number, completed: boolean },
  report: { engagementScore: number, issues: number, suggestions: string[] },
  metrics: GameplayMetrics,
  feedback: { grade: "A"|"B"|"C"|"D"|"F", shouldRegenerate: boolean, items: number },
  decision: unknown
}

// GameplayMetrics
{
  blueprintId, completionRate, dropOffTick, loopEngagementScore,
  economyStability, npcInteractionFrequency, mechanicsDiscoveryRate,
  totalEvents, averageEventsPerTick, sessionLength
}
```

---

## 2. Frontend Implementation Plan

### Phase A: Create src/services/simulationApi.ts

NEW service (justified: no existing simulation frontend service).

Functions:

- `runFullSimulation(blueprint)` → POST /api/simulate/game
- `getSimulationMetrics(gameId)` → GET /api/simulate/metrics/:gameId

Types to define:

- `SimulationResponse` (mirrors backend response shape)
- `GameplayMetrics`
- `PlaytestReportSummary`
- `FeedbackSummary`

### Phase B: Create src/features/workspace/components/SimulationPanel.tsx

New workspace component (fits established pattern — 25 existing panels).

Structure:

```
SimulationPanel
├── Header: "Game Simulation" + Run button
├── Grade display (A-F badge, large)
├── Metrics grid (4 cards: engagement, completion, economy, session)
├── Issues list (with severity badges)
├── Suggestions list
├── Feedback items (prioritized)
└── "Should Regenerate" warning banner (conditional)
```

States:

- **Idle**: "Run Simulation" button visible
- **Running**: Loader component
- **Success**: Full results display
- **Error**: Error message with retry
- **No Blueprint**: "Generate a project first" message

### Phase C: Add to Workspace.tsx

Add `<SimulationPanel />` to the workspace grid (middle column, after GameArchitectPanel).

Pass `activePipelineId` or blueprint data to enable simulation after generation.

---

## 3. User Workflow

```
1. User generates project (GenerateButton → pipeline runs)
2. Pipeline completes → artifacts available
3. User clicks "Run Simulation" in SimulationPanel
4. POST /api/simulate/game with blueprint data
5. Results displayed: grade, metrics, issues, suggestions
6. User can iterate: fix issues → regenerate → re-simulate
```

---

## 4. Component Reuse

| Need                | Existing Component            | Import             |
| ------------------- | ----------------------------- | ------------------ |
| Container           | Card                          | @/shared/ui/Card   |
| Severity indicators | Badge                         | @/shared/ui/Badge  |
| Action button       | Button                        | @/shared/ui/Button |
| Loading             | Loader                        | @/shared/ui/Loader |
| Progress bars       | CSS-based (same as Analytics) | Inline Tailwind    |

No new shared/ui components needed.

---

## 5. Files to Create/Modify

| File                                                    | Action                                       |
| ------------------------------------------------------- | -------------------------------------------- |
| `src/services/simulationApi.ts`                         | CREATE — simulation service                  |
| `src/features/workspace/components/SimulationPanel.tsx` | CREATE — workspace panel                     |
| `src/features/workspace/Workspace.tsx`                  | MODIFY — add SimulationPanel import + render |
| `src/services/__tests__/simulationApi.test.ts`          | CREATE — tests                               |

---

## 6. Risk Assessment

| Risk                                     | Level  | Mitigation                                                               |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Blueprint not available after generation | MEDIUM | Check if conceptApi provides blueprint, or fetch from pipeline artifacts |
| Simulation takes too long                | LOW    | Backend is synchronous <1s for 100 ticks                                 |
| Blueprint schema mismatch                | MEDIUM | Backend generates blueprints — schema should match. Verify with test.    |

---

## 7. Open Question

**How to get the blueprint for simulation?**

Options:

- A) Store blueprint in Workspace state after generation (requires pipeline to return it)
- B) Fetch blueprint from `/api/projects/:id` or artifact store
- C) Use conceptApi `getArtifactDetail()` to retrieve the generated blueprint artifact

**Recommendation**: Option C — conceptApi already has `getArtifactDetail(artifactId)` which can fetch blueprint content from pipeline artifacts. The SimulationPanel should scan artifacts for type "json" with name containing "blueprint".

---

## 8. Effort Estimate

| Task                       | Effort       |
| -------------------------- | ------------ |
| Create simulationApi.ts    | 30 min       |
| Create SimulationPanel.tsx | 2 hours      |
| Modify Workspace.tsx       | 15 min       |
| Create tests               | 30 min       |
| Documentation              | 30 min       |
| **Total**                  | **~4 hours** |
