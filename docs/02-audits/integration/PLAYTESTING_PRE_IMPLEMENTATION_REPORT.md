# Playtesting Pre-Implementation Report

**Date**: July 15, 2026  
**Task**: F-8 Pre-Implementation Analysis  
**Status**: COMPLETE — Ready for implementation

---

## Key Findings

| Question                | Answer                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| Backend API exists?     | ✅ YES — 2 endpoints at /api/playtest/*                                |
| Synchronous?            | ✅ YES — response in <1s                                               |
| New service needed?     | ✅ YES — playtestApi.ts                                                |
| Placement?              | **Workspace Panel** — needs scripts/assets from pipeline               |
| Relation to Simulation? | Complementary — Simulation tests gameplay, Playtest tests code quality |
| Input required?         | Scripts array + assets array + dependency graph                        |

---

## What Playtesting Does

Quality validation of generated Roblox experience code:

1. **Architecture analysis** — validates structure of generated scripts
2. **Lua quality** — checks for error handling (pcall), documentation, code patterns
3. **Asset validation** — verifies asset references and service targets
4. **Dependency analysis** — detects circular dependencies, depth
5. **Performance estimation** — predicted init time, risk areas
6. **Issue detection** — critical/warning/suggestion/optimization with fixes

---

## Response Structure — PlaytestReport

```typescript
{
  projectId, generatedAt, overallScore (0-100),
  classification: "production_ready" | "needs_work" | "critical_issues",
  scores: { architecture, lua, assets, dependencies, gameplay, performance },
  systemScores: Array<{ system, score, issues, status }>,
  issues: Array<{ id, severity, category, affectedArtifact, reason, recommendedFix, priority }>,
  performance: { scriptCount, assetCount, dependencyDepth, remoteEventCount, estimatedInitTimeMs, riskAreas },
  recommendations: PlaytestIssue[],
  summary: string
}
```

---

## Architecture Decision: Workspace Panel

**Reasoning**: Playtesting requires the project's generated scripts and assets as input — same as Simulation and Economy. It naturally follows the "Generate → Simulate → Playtest → Export" workflow within Workspace.

**Placement**: Right column (after ValidationResults, before GenerationHistoryPanel) — it's a quality/validation tool.

---

## Implementation Plan

### Files

| File                                                  | Action |
| ----------------------------------------------------- | ------ |
| `src/services/playtestApi.ts`                         | CREATE |
| `src/features/workspace/components/PlaytestPanel.tsx` | CREATE |
| `src/features/workspace/Workspace.tsx`                | MODIFY |
| `src/services/__tests__/playtestApi.test.ts`          | CREATE |

### Effort: ~4 hours

---

## Next Action

Implement F-8 following the IMPLEMENTATION_TASK_TEMPLATE.
