# Economy Designer Pre-Implementation Report

**Date**: July 15, 2026  
**Task**: F-5 Pre-Implementation Analysis  
**Status**: COMPLETE — Ready for implementation

---

## Key Findings

| Question                    | Answer                                                        |
| --------------------------- | ------------------------------------------------------------- |
| Backend API exists?         | ✅ YES — 4 endpoints at /api/economy/*                        |
| Synchronous?                | ✅ YES — response in <1s (200 tick simulation)                |
| New service needed?         | ✅ YES — economyApi.ts (no existing economy frontend service) |
| Workspace panel?            | ✅ YES — same pattern as SimulationPanel                      |
| Blueprint required?         | ✅ YES — needs blueprint.economy section                      |
| Integrates with Simulation? | YES — complementary (same input, different analysis)          |
| Chart library needed?       | ❌ NO — CSS bars + badges sufficient                          |

---

## Backend Capabilities

Full economy analysis pipeline in one endpoint:

1. **Model** — Parse blueprint economy section (currency, flows, sinks, stability index)
2. **Simulate** — 200-tick economy simulation (balance history, growth rate, bottlenecks)
3. **Detect** — Find imbalances (inflation, bottleneck, starvation, exploit-loop, broken-curve)
4. **Balance** — Generate correction patch with confidence score
5. **Feedback** — Produce actionable feedback for blueprint revision

---

## Architecture Decision

**Workspace Panel** — same reasoning as SimulationPanel:

- Requires blueprint from generation pipeline
- Complements existing SimulationPanel (gameplay vs economy analysis)
- Middle column placement after SimulationPanel
- No new page or route

---

## Estimated Effort: ~4 hours

| Task                       | Time   |
| -------------------------- | ------ |
| economyApi.ts service      | 30 min |
| EconomyPanel.tsx component | 2h     |
| Workspace.tsx modification | 15 min |
| Tests                      | 30 min |
| Documentation              | 30 min |

---

## Next Action

Implement F-5 following:

- `docs/02-audits/integration/ECONOMY_IMPLEMENTATION_PLAN.md`
- `docs/templates/IMPLEMENTATION_TASK_TEMPLATE.md`
