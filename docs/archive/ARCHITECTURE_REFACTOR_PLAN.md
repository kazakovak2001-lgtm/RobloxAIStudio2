# Architecture Refactor Plan — Roblox AI Studio DevKit

> **IMPORTANT**: No changes in this plan should be executed without explicit approval.
> All recommendations preserve 100% existing functionality.

---

## Phase 1: Remove Dead Code (Low Risk)

### 1.1 Delete `server/src/engine/GameGenerationEngine.ts`

- **Current**: Redundant composition root never used by `index.ts` or any import
- **Reason**: `GameGenerationService` in `projects/services/` is the canonical service; index.ts wires it directly
- **Risk**: NONE — no imports reference this file
- **Migration**: Delete file. No other changes needed.

### 1.2 Delete `server/src/pipeline/PipelineRunner.ts`

- **Current**: Thin wrapper that calls `agentService.executeAgent("pipeline", input)` — never invoked
- **Reason**: `AIPipelineIntegrator` is the real pipeline runner since v0.3
- **Risk**: NONE — no imports reference this file
- **Migration**: Delete file.

### 1.3 Delete `server/src/execution/pipelineEngine.ts`

- **Current**: 3-line re-export shim (`export { PipelineRunner } from "./stepRunner"`)
- **Reason**: stepRunner is imported directly everywhere; this shim adds confusion
- **Risk**: LOW — verify no external imports before deletion
- **Migration**: Search for `from "./pipelineEngine"` imports. If none, delete.

### 1.4 Delete `server/src/execution/incrementalGenerator.ts`

- **Current**: IncrementalGenerator class, never imported
- **Reason**: Was planned for checkpoint-based execution; superseded by Memory + Persistence layers
- **Risk**: NONE — no imports
- **Migration**: Delete file.

### 1.5 Delete `server/src/governance/orchestrator.ts`

- **Current**: Interface definitions for a speculative agent orchestration system (Agent, Orchestrator, WorkflowRequest, etc.)
- **Reason**: Never implemented. The real orchestrator is `OrchestratorAgent + CompilerOrchestrator`.
- **Risk**: NONE — no imports reference this file
- **Migration**: Delete file.

---

## Phase 2: Consolidate Duplicates (Medium Risk)

### 2.1 Consolidate `server/src/llm/LLMProvider.ts` into `server/src/providers/`

- **Current**: `llm/LLMProvider.ts` has OpenAI, Anthropic, Local providers — older implementations with same API
- **Recommended**: Delete `llm/LLMProvider.ts`; `providers/` folder is canonical
- **Risk**: LOW — verify no imports from `../llm/LLMProvider`
- **Migration**: Search codebase for `from "../llm/LLMProvider"` or `from "../../llm/LLMProvider"`. If none, delete.

### 2.2 Archive or Delete `agents/` (root-level)

- **Current**: Pre-v0.2 agent framework with different BaseAgent API, different orchestrator, different types
- **Recommended**: Move to `_archive/agents-legacy/` or delete entirely
- **Risk**: LOW — not imported by server/ or src/. May be referenced by `.kilo/` worktrees.
- **Migration**: Confirm no imports → delete or archive. Update `.kilo` worktrees if needed.

### 2.3 Move `server/src/governance/aiGovernance.ts` to `server/src/validation/`

- **Current**: Commit splitting / subsystem detection logic — belongs with commitValidator.ts
- **Recommended**: `server/src/validation/aiGovernance.ts`
- **Risk**: LOW — verify no imports then move
- **Migration**: Update any import paths (likely none since it's not imported by live code).

---

## Phase 3: Clean Generated Artifacts (No Risk)

### 3.1 Remove tracked generated files

- **Files**: `vite.config.d.ts`, `vite.config.d.ts.map`, `vite.config.js`, `vite.config.js.map`, `tsconfig.tsbuildinfo`, `src/**/*.d.ts.map`
- **Reason**: Already in .gitignore but were tracked from before cleanup. Some may have been re-committed.
- **Risk**: NONE
- **Migration**: `git rm --cached` for any still tracked. They're already gitignored.

---

## Phase 4: Documentation Update (No Risk)

### 4.1 Update `docs/ARCHITECTURE.md`

- Add sections for: Evaluation, Memory, Planning, Generation, Assembly, Persistence, Distributed, Cloud, Compiler API, Governance
- Remove outdated content that no longer reflects the system

### 4.2 Update `docs/API.md`

- Document CompilerAPI endpoints
- Document project management API
- Document assembly build/replay/diff/impact/CI flows

### 4.3 Archive stale root documents

- `IMPLEMENTATION_COMPLETE.md` → move to `docs/archive/`
- `IMPLEMENTATION_SUMMARY.md` → move to `docs/archive/`
- `QUICK_REFERENCE.md` → move to `docs/archive/`
- `TODO.md` → review and update or archive

---

## Phase 5: Future Considerations (Deferred)

### 5.1 Extract shared types package

- `server/src/types/` types are used by both BaseAgent and services
- Consider a `packages/types/` shared package in future monorepo restructure

### 5.2 Unify Registry pattern

- AssemblyRegistry, GenerationRegistry, MemoryRegistry, PlanningRegistry, PolicyRegistry, ProjectRegistry all follow singleton pattern
- Could extract a generic `Registry<T>` base class
- **Deferred** — current implementations are stable and specialized

### 5.3 Consider workspace structure (Turborepo/Nx)

- Frontend, server, and shared types could be split into workspace packages
- **Deferred** — current structure works for single-team development

---

## Estimated Impact Summary

| Phase   | Files Affected        | Risk Level | Behavior Change             |
| ------- | --------------------- | ---------- | --------------------------- |
| Phase 1 | 5 files deleted       | NONE       | Zero — all are dead code    |
| Phase 2 | 3 files moved/deleted | LOW        | Zero — unused by live paths |
| Phase 3 | ~5 files untracked    | NONE       | Zero — build artifacts only |
| Phase 4 | ~5 docs updated       | NONE       | Zero — documentation only   |
| Phase 5 | Deferred              | —          | —                           |

---

## Execution Order

1. Phase 3 first (zero risk, immediate hygiene benefit)
2. Phase 1 second (remove dead code, reduce noise)
3. Phase 2 third (consolidate duplicates)
4. Phase 4 last (docs reflect cleaned state)

**All phases require explicit approval before execution.**
