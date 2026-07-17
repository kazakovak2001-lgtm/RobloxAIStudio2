# Economy Designer Implementation Plan

**Date**: July 15, 2026  
**Task**: F-5 (Economy Designer)  
**Status**: PRE-AUDIT COMPLETE — Ready for implementation

---

## 1. Backend API Analysis

### Available Endpoints (server/src/routes/economy.ts)

| Endpoint                    | Method | Input                 | Output                                                 | Use Case                       |
| --------------------------- | ------ | --------------------- | ------------------------------------------------------ | ------------------------------ |
| /api/economy/analyze        | POST   | { blueprint, ticks? } | Model + Simulation + Report + Patch + Feedback         | Full economy analysis pipeline |
| /api/economy/simulate       | POST   | { blueprint, ticks? } | EconomySimulationResult (history, growth, bottlenecks) | Economy-only simulation        |
| /api/economy/balance        | POST   | { report }            | BalancePatch (adjustments + confidence)                | Get balance corrections        |
| /api/economy/report/:gameId | GET    | gameId                | Stored report (placeholder)                            | Retrieve saved data            |

### Response Shape — POST /api/economy/analyze

```typescript
{
  model: { currency: string, stability: number, netFlow: number },
  simulation: { ticks: number, finalBalance: number, growthRate: number },
  report: { healthScore: number, imbalances: number, critical: number },
  patch: { adjustments: number, confidence: number },
  feedback: unknown
}
```

### Key Backend Types

```typescript
EconomyModel { blueprintId, currency, flows: CurrencyFlow[], sinks: CurrencySink[], netFlowPerTick, inflationPressure, stabilityIndex }
CurrencyFlow { source: string, amount: number, frequency: number }
CurrencySink { target: string, cost: number, repeatable: boolean }
EconomySimulationResult { blueprintId, ticks, history: EconomyTick[], finalBalance, peakBalance, averageBalance, growthRate, stagnationDetected, exponentialGrowth, bottleneckTick }
Imbalance { type, severity, description, data }
ImbalanceReport { blueprintId, imbalances: Imbalance[], healthScore, critical, actionRequired }
```

---

## 2. Frontend Architecture Decision

### Placement: Workspace Panel (same pattern as SimulationPanel)

**Reasoning**:

- Economy analysis requires a blueprint (same as Simulation)
- User flow: Generate → Simulate gameplay → **Analyze economy** → Review
- Naturally pairs with SimulationPanel in the workflow
- Same input (blueprint), complementary analysis
- No new route/page needed

**Location**: Middle column, after SimulationPanel, before ArtifactExplorer

---

## 3. Implementation Plan

### Phase A: Create src/services/economyApi.ts

Functions:

- `analyzeEconomy(blueprint, ticks?)` → POST /api/economy/analyze
- `simulateEconomy(blueprint, ticks?)` → POST /api/economy/simulate

Types:

- `EconomyAnalysisResponse` (model + simulation + report + patch)
- `EconomyModelSummary`
- `EconomySimulationSummary`
- `ImbalanceReport`

### Phase B: Create src/features/workspace/components/EconomyPanel.tsx

Structure:

```
EconomyPanel
├── Header: "Economy Analysis" + Analyze button
├── Health Score (0-100 with CSS bar)
├── Model summary: currency name, stability index, net flow
├── Simulation summary: growth rate, final balance, bottleneck warning
├── Imbalances list (with severity badges)
├── Patch: number of adjustments + confidence score
└── "Action Required" warning (if critical imbalances)
```

States: idle, running, success, error

### Phase C: Add to Workspace.tsx

Import + render after SimulationPanel in middle column.

### Phase D: Tests

`src/services/__tests__/economyApi.test.ts` — success, error, network failure

---

## 4. User Workflow

```
Generate Blueprint → Run Game Simulation → Analyze Economy →
Review: health score, imbalances, balance patch →
Decide: accept or regenerate with adjustments
```

---

## 5. Component Reuse

| Need            | Existing                           | Location           |
| --------------- | ---------------------------------- | ------------------ |
| Container       | Card                               | @/shared/ui/Card   |
| Severity badges | Badge                              | @/shared/ui/Badge  |
| Action button   | Button                             | @/shared/ui/Button |
| Loading         | Loader                             | @/shared/ui/Loader |
| Progress bars   | CSS (same as Analytics/Simulation) | Inline             |

No new shared/ui components needed.

---

## 6. Integration with Other Systems

| System             | Relationship                                                |
| ------------------ | ----------------------------------------------------------- |
| Simulation         | Both use blueprint as input — complementary views           |
| Analytics          | Economy health could feed into analytics dashboard (future) |
| AI Studio          | Economy feedback could suggest Lua script changes (future)  |
| Workspace pipeline | Runs after generation completes                             |

---

## 7. Files to Create/Modify

| File                                                 | Action                       |
| ---------------------------------------------------- | ---------------------------- |
| `src/services/economyApi.ts`                         | CREATE                       |
| `src/features/workspace/components/EconomyPanel.tsx` | CREATE                       |
| `src/features/workspace/Workspace.tsx`               | MODIFY (add import + render) |
| `src/services/__tests__/economyApi.test.ts`          | CREATE                       |

---

## 8. Effort Estimate

| Task                    | Effort       |
| ----------------------- | ------------ |
| Create economyApi.ts    | 30 min       |
| Create EconomyPanel.tsx | 2 hours      |
| Modify Workspace.tsx    | 15 min       |
| Tests                   | 30 min       |
| Documentation           | 30 min       |
| **Total**               | **~4 hours** |

---

## 9. Risks

| Risk                               | Level  | Mitigation                                        |
| ---------------------------------- | ------ | ------------------------------------------------- |
| Blueprint economy section empty    | MEDIUM | Backend handles gracefully (default values)       |
| Complex imbalance data display     | LOW    | Use simple list + severity badge (proven pattern) |
| Workspace panel count growing (23) | LOW    | Still within acceptable range per workspace audit |

---

## 10. Definition of Done

- [ ] economyApi.ts created with types + 2 functions
- [ ] EconomyPanel.tsx with idle/running/success/error states
- [ ] Panel renders in Workspace middle column
- [ ] Tests pass (5+ assertions)
- [ ] TypeScript PASS
- [ ] Vite PASS
- [ ] CURRENT_STATE.md updated
- [ ] ROADMAP_STATUS.md updated
- [ ] Migration doc + report created
