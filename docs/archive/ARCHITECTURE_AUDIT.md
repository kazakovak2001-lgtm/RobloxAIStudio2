# Architecture Audit — Roblox AI Studio DevKit v1.3

## 1. Duplicate Analysis

### Critical Duplicates

| Duplicate A                                    | Duplicate B                                               | Status                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `agents/` (root-level)                         | `server/src/agents/`                                      | **`agents/` is legacy** — not imported by any server code. Canonical: `server/src/agents/`                                                 |
| `server/src/llm/LLMProvider.ts`                | `server/src/providers/*.ts`                               | **`llm/` is legacy** — contains older OpenAI/Anthropic/Local implementations. Canonical providers: `server/src/providers/`                 |
| `server/src/pipeline/PipelineRunner.ts`        | `server/src/execution/stepRunner.ts`                      | **`pipeline/` is vestigial** — PipelineRunner is never used by the live pipeline. Canonical: `execution/aiPipelineIntegrator.ts`           |
| `server/src/engine/GameGenerationEngine.ts`    | `server/src/projects/services/game-generation.service.ts` | **`engine/` is redundant** — creates a second composition root that duplicates `index.ts` wiring. Never called.                            |
| `server/src/governance/orchestrator.ts`        | `server/src/agents/implementations/OrchestratorAgent.ts`  | **`governance/orchestrator.ts` is speculative** — defines unused interfaces (Agent, Orchestrator, WorkflowRequest). Not imported anywhere. |
| `server/src/governance/aiGovernance.ts`        | `server/src/governance/GovernancePolicyEngine.ts`         | **`aiGovernance.ts` is a different concern** — commit splitting logic, not CI governance. Could be in `validation/` instead.               |
| `server/src/execution/pipelineEngine.ts`       | `server/src/execution/stepRunner.ts`                      | **`pipelineEngine.ts` is just a re-export shim** — 3 lines, exports stepRunner + types                                                     |
| `server/src/execution/incrementalGenerator.ts` | (nothing)                                                 | **Unused** — IncrementalGenerator exists but is never imported by any module                                                               |

### Near-Duplicates (Naming Overlap)

| Concept              | Locations                                                                                              | Canonical                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| "ProjectRegistry"    | `server/src/compiler/ProjectRegistry.ts` (multi-project) vs `server/src/projects/` (CRUD)              | Both serve different roles — compiler projects vs game projects. Naming overlap but not functional duplicate. |
| "BlueprintValidator" | `server/src/generation/BlueprintValidator.ts` vs `server/src/projects/services/blueprint.validator.ts` | Different schemas validated. generation/ validates GameBlueprint; projects/ validates persistence blueprint.  |

## 2. Dead Code Analysis

| File                                                                               | Issue                                                 | Evidence                                                             |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `agents/` (entire directory)                                                       | Never imported by server or frontend                  | `server/src/agents/` is the canonical implementation                 |
| `server/src/llm/LLMProvider.ts`                                                    | Superseded by `server/src/providers/*.ts`             | Factory uses providers/, not llm/                                    |
| `server/src/pipeline/PipelineRunner.ts`                                            | Never imported in live execution path                 | aiPipelineIntegrator is the runner                                   |
| `server/src/engine/GameGenerationEngine.ts`                                        | Never instantiated (index.ts wires services directly) | Redundant composition root                                           |
| `server/src/execution/incrementalGenerator.ts`                                     | Never imported anywhere                               | Was planned but never integrated                                     |
| `server/src/execution/pipelineEngine.ts`                                           | Re-export only; stepRunner used directly              | 3-line shim                                                          |
| `server/src/governance/orchestrator.ts`                                            | Interface-only, never implemented                     | Speculative future design                                            |
| `vite.config.d.ts`, `vite.config.js`, `vite.config.js.map`, `vite.config.d.ts.map` | Build artifacts in repo                               | Should be gitignored (already in .gitignore but tracked from before) |
| `tsconfig.tsbuildinfo`                                                             | Build cache tracked                                   | Should be gitignored                                                 |
| `src/**/*.d.ts.map`                                                                | Generated artifacts                                   | Should be gitignored                                                 |

## 3. Layer Boundary Violations

| Violation                                                                        | Description                                                           | Severity                                 |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `server/src/compiler/CompilerOrchestrator.ts` imports `AssemblyBuilder` directly | Orchestrator should delegate through registry, not construct builders | LOW — works but couples layers           |
| `server/src/compiler/CompilerAPI.ts` imports `ExecutionGuard`                    | Guard should be internal to orchestrator                              | LOW — could be encapsulated              |
| Root-level `agents/` exists alongside `server/src/agents/`                       | Confusing for new developers                                          | MEDIUM — should be documented or removed |

No upper-layer imports from lower layers detected. Dependency direction is correct.

## 4. Naming Inconsistencies

| Current                                                              | Expected Convention                               | Files Affected                 |
| -------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| `aiGovernance.ts` (camelCase)                                        | `AiGovernance.ts` or move to `validation/`        | 1                              |
| `pipelineEngine.ts` (re-export shim)                                 | Should not exist as a separate module             | 1                              |
| `CompilerContextManager` vs `MemoryRegistry`                         | Both are "context managers" but named differently | Acceptable — different domains |
| `AssemblyRegistry` (file-backed) vs `GenerationRegistry` (in-memory) | Both called "Registry" but different durability   | Acceptable — documented        |

## 5. Frontend Audit

| Finding                                                                                     | Severity                      |
| ------------------------------------------------------------------------------------------- | ----------------------------- |
| `src/services/socket.ts` and `src/hooks/useSocket.ts` — socket logic split across two files | LOW — standard separation     |
| `src/pages/*.d.ts.map` — generated artifacts tracked                                        | MEDIUM — should be gitignored |
| No duplicated hooks detected                                                                | —                             |
| No duplicated state management detected                                                     | —                             |

## 6. Storage Audit

| Path                       | Tracked?                   | Should Be? |
| -------------------------- | -------------------------- | ---------- |
| `dist/`                    | Gitignored ✓               | ✓          |
| `storage/`                 | Gitignored ✓               | ✓          |
| `node_modules/`            | Gitignored ✓               | ✓          |
| `tsconfig.tsbuildinfo`     | Gitignored ✓ (rule exists) | ✓          |
| `vite.config.js/d.ts/maps` | Gitignored ✓ (rule exists) | ✓          |

## 7. Documentation Gaps

| Document                     | Status            | Issue                                              |
| ---------------------------- | ----------------- | -------------------------------------------------- |
| `docs/ARCHITECTURE.md`       | Outdated          | Doesn't reflect v0.6–v1.3 additions                |
| `docs/API.md`                | Outdated          | Doesn't document CompilerAPI or assembly endpoints |
| `IMPLEMENTATION_COMPLETE.md` | Stale             | Refers to earlier project state                    |
| `IMPLEMENTATION_SUMMARY.md`  | Stale             | Refers to earlier project state                    |
| `QUICK_REFERENCE.md`         | Stale             | Pre-compiler documentation                         |
| `TODO.md`                    | Unknown relevance | May contain completed items                        |
| ADR-0001..0008               | Current ✓         | Covers v0.2–v0.95 decisions                        |

## 8. Risk Summary

| Risk                                           | Impact                     | Recommendation               |
| ---------------------------------------------- | -------------------------- | ---------------------------- |
| `agents/` root directory confuses architecture | Developer confusion        | Document as legacy OR delete |
| `server/src/llm/` duplicates providers/        | Import confusion           | Delete or consolidate        |
| Dead modules add build noise                   | Slower IDE, grep pollution | Remove or archive            |
| Outdated docs mislead new developers           | Incorrect assumptions      | Update after cleanup         |
