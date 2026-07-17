# Duplicate Analysis — Roblox AI Studio DevKit

## Pipeline Orchestration (Critical Overlap Area)

| Component              | Location                           | Role                                            | Used By                                   |
| ---------------------- | ---------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `AIPipelineIntegrator` | execution/aiPipelineIntegrator.ts  | Plan-driven agent loop with evaluation + memory | `GameGenerationService.startGeneration()` |
| `PlanExecutor`         | planning/execution/PlanExecutor.ts | DAG-driven agent loop with memory + evaluation  | `routes/compile.ts`, `routes/planning.ts` |
| `PipelineRunner`       | pipeline/PipelineRunner.ts         | Thin wrapper calling agentService               | **DEAD — not imported**                   |
| `pipelineEngine`       | execution/pipelineEngine.ts        | Re-export shim for stepRunner                   | **DEAD — 3 lines**                        |

**Assessment**: `AIPipelineIntegrator` and `PlanExecutor` serve the SAME purpose (execute agents in order with evaluation + memory). They exist because PlanExecutor (v0.7 route) was added without replacing AIPipelineIntegrator (v0.3 route).

**Recommendation**: Keep PlanExecutor as canonical (newer, cleaner, DAG-aware). AIPipelineIntegrator stays because `GameGenerationService` depends on it — but new development should use PlanExecutor path (`/api/compile`).

---

## Generation Pipeline (Overlap Area)

| Component               | Location                                    | Role                                          | Used By                         |
| ----------------------- | ------------------------------------------- | --------------------------------------------- | ------------------------------- |
| `GenerationPipeline`    | generation/GenerationPipeline.ts            | Finalizes GameBlueprint from memory context   | Not directly called in MVP path |
| `GameBlueprintEngine`   | generation/blueprint/GameBlueprintEngine.ts | Creates RobloxGameBlueprint from plan outputs | `routes/compile.ts`             |
| `RobloxExportBuilder`   | generation/export/RobloxExportBuilder.ts    | Blueprint → Rojo project (v0.9)               | Not in MVP path                 |
| `RobloxProjectCompiler` | export/RobloxProjectCompiler.ts             | Artifact → Roblox project (MVP)               | `routes/compile.ts`             |

**Assessment**: `RobloxExportBuilder` (v0.9) and `RobloxProjectCompiler` (MVP) produce similar output structures. The compiler takes a GameArtifact (richer input) while the exporter takes raw components.

**Recommendation**: `RobloxProjectCompiler` is canonical for MVP. `RobloxExportBuilder` can be archived if GameArtifact path becomes the only production flow.

---

## Memory Systems (Overlap Area)

| Component           | Location                           | Role                                       | Scope                      |
| ------------------- | ---------------------------------- | ------------------------------------------ | -------------------------- |
| `ProjectMemory`     | memory/ProjectMemory.ts            | Per-execution mutable state (STM)          | Within single pipeline run |
| `MemoryManager`     | memory/MemoryManager.ts            | Agent-facing API for ProjectMemory         | Within single pipeline run |
| `MemoryEngine`      | memory/core/MemoryEngine.ts        | Cross-session persistent memory (LTM + SM) | Across all runs            |
| `AgentMemoryBridge` | memory/agents/AgentMemoryBridge.ts | Hook for per-agent memory injection        | PlanExecutor path          |

**Assessment**: Two memory systems exist by design — STM (per-execution, v0.7) and LTM (persistent, v0.6 extension). They serve different lifecycles.

**Recommendation**: NOT duplicates. Keep both. Document the distinction clearly.

---

## Evaluation Systems (Overlap Area)

| Component                                              | Location                              | Role                                                             |
| ------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| `EvaluationRegistry` + `Evaluator` + `EvaluationRules` | evaluation/ (root)                    | Structural JSON validation per pipeline step (v0.6)              |
| `EvaluationEngine` + `AgentEvaluator`                  | evaluation/core/ + evaluation/agents/ | Quality scoring (coherence, completeness, risk) (v0.5 extension) |

**Assessment**: Different concerns — structural validation vs quality scoring. Both run on the same outputs but measure different things.

**Recommendation**: NOT duplicates. Keep both. The v0.6 Evaluator gates the pipeline; the v0.5 EvaluationEngine scores quality for analytics.

---

## Planning Systems (No Overlap)

| Component        | Location                       | Role                                                                |
| ---------------- | ------------------------------ | ------------------------------------------------------------------- |
| `PlanningEngine` | planning/PlanningEngine.ts     | Pipeline stage scheduling (v0.8 — determines which agent runs next) |
| `PlannerEngine`  | planning/core/PlannerEngine.ts | Goal decomposition (v0.7 extension — converts intent → task DAG)    |

**Assessment**: Different roles — PlanningEngine manages step ordering, PlannerEngine decomposes goals. Naming similarity is confusing.

**Recommendation**: Rename `PlanningEngine` → `StepScheduler` in future refactor. No code change now.

---

## Summary

| Category               | Verdict                                                       |
| ---------------------- | ------------------------------------------------------------- |
| Pipeline orchestration | PARTIAL OVERLAP (AIPipelineIntegrator ↔ PlanExecutor)         |
| Export builders        | PARTIAL OVERLAP (RobloxExportBuilder ↔ RobloxProjectCompiler) |
| Memory systems         | DESIGNED SEPARATION (STM ↔ LTM)                               |
| Evaluation systems     | DESIGNED SEPARATION (structural ↔ quality)                    |
| Planning systems       | NO OVERLAP (scheduling ↔ decomposition)                       |
| Dead files             | 5 confirmed dead, 1 quarantined                               |
