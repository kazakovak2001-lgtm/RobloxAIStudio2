# Analytics Integration — Implementation Plan

**Date**: July 15, 2026  
**Task**: F-1 (Connect Analytics Page to Backend)  
**Status**: PRE-AUDIT COMPLETE — Ready for implementation

---

## 1. Backend API Analysis

### Available Endpoints (server/src/routes/analytics.ts)

| Endpoint                     | Method | Response                                                                                                                        | Use Case                     |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| /api/analytics/system        | GET    | SystemHealthReport (overallScore, agentHealth, pipelineHealth, failureRate, averageExecutionScore, activePatterns, suggestions) | Top-level metric cards       |
| /api/analytics/agents        | GET    | { count, agents: AgentPerformanceSummary[] }                                                                                    | Agent performance table/list |
| /api/analytics/agent/:name   | GET    | { summary, patterns, latestSignal }                                                                                             | Individual agent detail      |
| /api/analytics/execution/:id | GET    | PipelineEfficiencyReport                                                                                                        | Pipeline execution detail    |
| /api/analytics/patterns      | GET    | { count, patterns: FailurePattern[] }                                                                                           | Failure patterns display     |
| /api/analytics/signals       | GET    | { count, signals: FeedbackSignal[] }                                                                                            | Signal activity feed         |
| /api/analytics/suggestions   | GET    | { count, suggestions: OptimizationSuggestion[] }                                                                                | Optimization recommendations |
| /api/analytics/cycle         | POST   | FeedbackCycleResult                                                                                                             | Trigger refresh              |
| /api/analytics/slowest       | GET    | AgentPerformanceSummary[]                                                                                                       | Slowest agents list          |
| /api/analytics/lowest-scores | GET    | AgentPerformanceSummary[]                                                                                                       | Lowest quality agents        |

### Backend Types (server/src/core/analytics/types.ts)

```typescript
AgentPerformanceSummary {
  agent, totalExecutions, successRate, averageScore,
  averageDurationMs, minScore, maxScore, failureCount, trend
}

SystemHealthReport {
  overallScore, agentHealth, pipelineHealth, memoryHealth,
  failureRate, averageExecutionScore, activePatterns, suggestions, timestamp
}

FailurePattern { patternId, type, agent, frequency, lastOccurrence, description, severity }
FeedbackSignal { signalId, type, source, value, timestamp, metadata }
OptimizationSuggestion { id, type, priority, description, expectedImprovement, affectedNodes, confidence }
```

---

## 2. Frontend Analysis

### Current AnalyticsPage State (DEMO)

- 4 hardcoded metric cards (Total Generations, Success Rate, Avg Tokens, Total Cost)
- Time range selector (7d/30d/90d) — changes state but has NO effect
- 2 "Graph component not yet implemented" placeholders
- 1 "Generation Statistics" section with 3 more hardcoded numbers
- Zero API calls, zero imports from services

### Existing Frontend Infrastructure (REUSABLE)

- `@/shared/ui/Card` — metric card containers ✅
- `@/shared/ui/Button` — export button ✅
- `@/shared/ui/Badge` — severity/trend indicators ✅
- `@/shared/ui/Loader` — loading state ✅
- `@/services/api.ts` — generic apiFetch wrapper ✅
- Design tokens (success-400, error-400, warning-400) ✅

---

## 3. Answers to Key Questions

| Question                                              | Answer                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does analytics API have frontend-compatible response? | **YES** — JSON with `{ success: true, data: {...} }` pattern, matches all other services                                                               |
| Are types already available?                          | **NO** — types are in `server/src/core/analytics/types.ts`, need to be duplicated in frontend service                                                  |
| Can existing API client be reused?                    | **PARTIALLY** — `api.ts` (apiFetch) exists but no `analyticsApi.ts` service. MUST CREATE new service file.                                             |
| Which chart library is installed?                     | **NONE** — no chart library in package.json. Options: recharts (React-native), or skip charts for v1 and use simple bar-based UI                       |
| What is the minimal required implementation?          | Replace hardcoded data with API calls. Use existing Card/Badge components for display. Skip complex charts — use simple progress bars and text for v1. |

---

## 4. Implementation Plan

### Phase A: Create analyticsApi.ts service (NEW — justified: no existing analytics service)

Location: `src/services/analyticsApi.ts`

Functions needed:

- `getSystemHealth()` → GET /api/analytics/system
- `getAgentSummaries()` → GET /api/analytics/agents
- `getFailurePatterns()` → GET /api/analytics/patterns
- `getOptimizationSuggestions()` → GET /api/analytics/suggestions
- `getSlowestAgents(n)` → GET /api/analytics/slowest
- `getLowestScoringAgents(n)` → GET /api/analytics/lowest-scores
- `triggerCycle()` → POST /api/analytics/cycle

Types to define in the service file:

- `SystemHealthReport` (mirror backend type)
- `AgentPerformanceSummary` (mirror backend type)
- `FailurePattern` (mirror backend type)
- `OptimizationSuggestion` (mirror backend type)

### Phase B: Update AnalyticsPage.tsx

Replace hardcoded data:

1. Top metric cards → from `getSystemHealth()` response
2. Time range selector → pass as query param to `/api/analytics/system?range=7d` (or use local filtering)
3. "Usage Overview" section → show `AgentPerformanceSummary[]` as a simple table or bar chart
4. "Project Metrics" section → show `FailurePattern[]` list
5. "Generation Statistics" section → derive from SystemHealthReport data
6. Add "Suggestions" section → show `OptimizationSuggestion[]`

States needed:

- Loading (Loader component)
- Error (Card with retry button)
- Empty (no data message)
- Success (rendered data)

### Phase C: Chart Strategy (v1 — NO new dependency)

**Decision**: For v1, do NOT install a chart library. Instead:

- Use CSS-based progress bars for scores (h-2 bg-brand-500 with width %)
- Use table/list layout for agent summaries
- Use Badge variants for severity/trend indicators
- This avoids a new dependency and can be upgraded to recharts later

---

## 5. Effort Estimate

| Task                     | Effort         |
| ------------------------ | -------------- |
| Create analyticsApi.ts   | 30 min         |
| Update AnalyticsPage.tsx | 2 hours        |
| Testing/validation       | 30 min         |
| Documentation            | 30 min         |
| **Total**                | **~3.5 hours** |

---

## 6. Files to Create/Modify

| File                                                    | Action                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `src/services/analyticsApi.ts`                          | CREATE — new service (justified: no existing analytics service) |
| `src/pages/AnalyticsPage.tsx`                           | MODIFY — replace hardcoded data with API calls                  |
| `docs/00-project-control/CURRENT_STATE.md`              | UPDATE — mark F-1 complete                                      |
| `docs/04-migrations/completed/analytics-integration.md` | CREATE — migration record                                       |

---

## 7. Risk Assessment

| Risk                                              | Level  | Mitigation                                                                  |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| Backend returns empty data (no pipeline runs yet) | LOW    | Handle empty state gracefully                                               |
| Time range filtering not supported by backend     | MEDIUM | Backend has no range param — implement client-side filtering or skip for v1 |
| No chart library                                  | LOW    | Use CSS-based bars for v1, upgrade later                                    |

---

## 8. Next Recommended Action

**Implement F-1** following this plan:

1. Create `src/services/analyticsApi.ts`
2. Rewrite `src/pages/AnalyticsPage.tsx`
3. Validate builds
4. Update documentation
