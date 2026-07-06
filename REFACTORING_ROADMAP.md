# Refactoring Roadmap — Roblox AI Studio DevKit

## Phase 0: Dead Code Removal (Day 1)

**Goal**: Remove all confirmed dead files.
**Affected files**: 6 files
**Risk**: ZERO (0 imports)
**Rollback**: `git revert HEAD`
**Effort**: 5 minutes
**Benefit**: Cleaner tree, no grep noise, reduced build scope

```
DELETE: server/src/engine/GameGenerationEngine.ts
DELETE: server/src/pipeline/PipelineRunner.ts
DELETE: server/src/execution/pipelineEngine.ts
DELETE: server/src/execution/incrementalGenerator.ts
DELETE: server/src/governance/orchestrator.ts
DELETE: server/src/_quarantine/ (entire directory)
```

---

## Phase 1: Route Consolidation (Day 2–3)

**Goal**: Reduce 11 route files to 7 canonical routes.
**Affected files**: 4 route files merged/removed
**Risk**: LOW (routes are leaf nodes — no other code depends on them)
**Rollback**: `git revert`
**Effort**: 2 hours
**Benefit**: Clearer API surface, less confusion for consumers

| Action               | File                        | Reason                          |
| -------------------- | --------------------------- | ------------------------------- |
| KEEP                 | `routes/compile.ts`         | MVP canonical endpoint          |
| KEEP                 | `routes/projects.ts`        | CRUD                            |
| KEEP                 | `routes/evaluation.ts`      | Quality analytics               |
| KEEP                 | `routes/memory.ts`          | Memory access                   |
| KEEP                 | `routes/simulation.ts`      | Playtest                        |
| KEEP                 | `routes/lifecycle.ts`       | Long-term maintenance           |
| MERGE INTO compile   | `routes/generation-v2.ts`   | Duplicate of compile path       |
| DEPRECATE            | `routes/game-generation.ts` | Legacy route from v0.2          |
| MERGE INTO lifecycle | `routes/economy.ts`         | Economy is part of lifecycle    |
| MERGE INTO lifecycle | `routes/world.ts`           | World is part of lifecycle      |
| MERGE INTO compile   | `routes/planning.ts`        | Planning is internal to compile |

---

## Phase 2: Governance Cleanup (Day 3)

**Goal**: Fix misplaced files in governance/.
**Affected files**: 1 move
**Risk**: LOW
**Rollback**: `git revert`
**Effort**: 30 minutes

| Action | File                         | Destination                  |
| ------ | ---------------------------- | ---------------------------- |
| MOVE   | `governance/aiGovernance.ts` | `validation/aiGovernance.ts` |

---

## Phase 3: Generation Module Unification (Day 4–5)

**Goal**: Consolidate export paths under artifacts/.
**Affected files**: 2
**Risk**: LOW-MEDIUM (need to update imports)
**Rollback**: `git revert`
**Effort**: 1 hour

| Action    | File                                                                     | Reason                            |
| --------- | ------------------------------------------------------------------------ | --------------------------------- |
| MOVE      | `export/RobloxProjectCompiler.ts` → `artifacts/RobloxProjectCompiler.ts` | Belongs with GameArtifact         |
| DEPRECATE | `generation/export/RobloxExportBuilder.ts`                               | Superseded by artifacts/ compiler |

---

## Phase 4: Domain Structure Introduction (Week 2)

**Goal**: Create `domains/` directory and move domain modules.
**Affected files**: ~100+ (all import paths update)
**Risk**: MEDIUM (many import path changes)
**Rollback**: `git revert` (single commit per domain)
**Effort**: 1 day per domain (10 domains = 2 weeks)
**Benefit**: Clear domain boundaries, easier onboarding

**Migration order** (lowest risk first):

1. economy/ → domains/economy/
2. world/ → domains/world/
3. simulation/ → domains/simulation/
4. lifecycle/ → domains/lifecycle/
5. collaboration/ → domains/collaboration/
6. governance/ → domains/governance/
7. evaluation/ → domains/evaluation/
8. memory/ → domains/memory/
9. planning/ → domains/planning/
10. generation/ + artifacts/ → domains/generation/

---

## Phase 5: Infrastructure Extraction (Week 3)

**Goal**: Create `infrastructure/` directory.
**Affected files**: ~20
**Risk**: LOW-MEDIUM
**Effort**: 1 day

Move: distributed/, cloud/, eventsource/, socket/ → infrastructure/

---

## Phase 6: Core Extraction (Week 3)

**Goal**: Create `core/` with agents, ai, providers, types, execution.
**Affected files**: ~40
**Risk**: MEDIUM (widely imported)
**Effort**: 2 days

---

## Timeline Summary

| Phase             | Effort  | Risk    | Dependencies |
| ----------------- | ------- | ------- | ------------ |
| 0: Dead code      | 5 min   | ZERO    | None         |
| 1: Routes         | 2 hours | LOW     | None         |
| 2: Governance     | 30 min  | LOW     | None         |
| 3: Generation     | 1 hour  | LOW-MED | None         |
| 4: Domains        | 2 weeks | MEDIUM  | Phase 0–3    |
| 5: Infrastructure | 1 day   | LOW-MED | Phase 4      |
| 6: Core           | 2 days  | MEDIUM  | Phase 4      |

**Total estimated effort**: ~3 weeks of incremental work
**No phase blocks production use** — each phase is independently deployable.
