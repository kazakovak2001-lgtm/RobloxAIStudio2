# Agent Merge Report — v1.3.2

## Summary

Merged two coexisting agent architectures into a single canonical implementation at `server/src/agents/`.

## Comparison Matrix

| Legacy (`agents/`)                | Canonical (`server/src/agents/`)          | Status                                       | Action                                                          |
| --------------------------------- | ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `base/AgentBase.ts`               | `core/BaseAgent.ts`                       | Different API (generic vs abstract)          | Canonical preserved; legacy removed                             |
| `orchestrator/Orchestrator.ts`    | `implementations/OrchestratorAgent.ts`    | Different design (runner vs dual-mode agent) | Canonical preserved                                             |
| `providers/LocalModelProvider.ts` | Agents have built-in fallback mode        | Equivalent functionality                     | Canonical's `if (!this.llm) return fallback` pattern supersedes |
| `agents/RequirementsAgent.ts`     | `implementations/RequirementsAgent.ts`    | Legacy: stub output only                     | Canonical: full LLM + fallback                                  |
| `agents/PlannerAgent.ts`          | `implementations/PlannerAgent.ts`         | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/GameDesignerAgent.ts`     | `implementations/GameDesignerAgent.ts`    | Legacy: stub                                 | Canonical: full LLM + seed                                      |
| `agents/RobloxArchitectAgent.ts`  | `implementations/RobloxArchitectAgent.ts` | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/LuaGeneratorAgent.ts`     | `implementations/LuaGeneratorAgent.ts`    | Legacy: stub                                 | Canonical: full LLM + code gen                                  |
| `agents/UIGeneratorAgent.ts`      | `implementations/UIGeneratorAgent.ts`     | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/AssetPlannerAgent.ts`     | `implementations/AssetPlannerAgent.ts`    | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/DatabaseAgent.ts`         | `implementations/DatabaseAgent.ts`        | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/DocumentationAgent.ts`    | `implementations/DocumentationAgent.ts`   | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/TesterAgent.ts`           | `implementations/TesterAgent.ts`          | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/DebugAgent.ts`            | `implementations/DebugAgent.ts`           | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/PerformanceAgent.ts`      | `implementations/PerformanceAgent.ts`     | Legacy: stub                                 | Canonical: full LLM                                             |
| `agents/OrchestratorAgent.ts`     | `implementations/OrchestratorAgent.ts`    | Legacy: stub                                 | Canonical: dual-mode LLM                                        |
| `types.ts`                        | `server/src/types/index.ts`               | Different interfaces                         | Canonical types used everywhere                                 |
| `index.ts`                        | (no equivalent needed)                    | Re-export barrel                             | Removed                                                         |
| `demo.ts`                         | (no equivalent needed)                    | CLI demo script                              | Removed                                                         |

## Unique Legacy Features Assessed

| Feature                                 | Exists in Canonical?                                           | Action                                           |
| --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Generic `AgentBase<TInput, TOutput>`    | BaseAgent uses `AgentInput` (open record)                      | Canonical is more flexible — no migration needed |
| `validate(input, output)` method        | Evaluation layer (v0.6) handles validation externally          | Superseded by `EvaluationRegistry`               |
| `LocalModelProvider` (intent detection) | Every agent has built-in fallback when `this.llm` is undefined | Functionally identical                           |
| `Orchestrator.runPipeline()` with logs  | `AIPipelineIntegrator` + `PlanningEngine`                      | Far more sophisticated                           |
| `AgentContext.sharedState`              | `ProjectMemory` (v0.7)                                         | Superseded                                       |

**Conclusion**: No unique functionality existed in the legacy implementation that is not already present (in a more complete form) in the canonical implementation.

## Files Removed

- `agents/base/AgentBase.ts`
- `agents/orchestrator/Orchestrator.ts`
- `agents/providers/LocalModelProvider.ts`
- `agents/agents/RequirementsAgent.ts`
- `agents/agents/PlannerAgent.ts`
- `agents/agents/GameDesignerAgent.ts`
- `agents/agents/RobloxArchitectAgent.ts`
- `agents/agents/LuaGeneratorAgent.ts`
- `agents/agents/UIGeneratorAgent.ts`
- `agents/agents/AssetPlannerAgent.ts`
- `agents/agents/DatabaseAgent.ts`
- `agents/agents/DocumentationAgent.ts`
- `agents/agents/TesterAgent.ts`
- `agents/agents/DebugAgent.ts`
- `agents/agents/PerformanceAgent.ts`
- `agents/agents/OrchestratorAgent.ts`
- `agents/types.ts`
- `agents/index.ts`
- `agents/demo.ts`

## Files Modified

- `src/services/aiEngine.ts` — Rewrote from legacy agent imports to HTTP API client (calls backend `/api/projects/:id/generate`)

## TypeScript Strict Mode Fixes (pre-existing)

Fixed unused imports/params across: AssemblyDiffEngine, AssemblyImpactAnalyzer, AssemblyRegistry, DependencyResolver, ClusterTopologyManager, NetworkDispatcher, CompilerOrchestrator, JobResultAggregator, WorkerHealthMonitor, aiPipelineIntegrator, ProjectContext, PlanningEngine

## Compatibility Notes

- No server-side API changes — all endpoints work identically
- Frontend now calls backend API instead of running agents in-browser
- Socket.io streaming unchanged
- All 13 agents continue to function with LLM or in fallback mode
