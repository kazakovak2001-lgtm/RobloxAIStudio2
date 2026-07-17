# Architecture Audit v2 — Roblox AI Studio DevKit

## Dependency Graph (Top-Level)

```
routes/compile.ts (MVP entrypoint)
  → planning/core/PlannerEngine → planning/model/TaskGraph
  → planning/execution/PlanExecutor
    → memory/agents/AgentMemoryBridge → memory/core/MemoryEngine
    → evaluation/agents/AgentEvaluator → evaluation/core/EvaluationEngine
    → agents/core/AgentRegistry → agents/implementations/* → ai/provider
  → generation/blueprint/GameBlueprintEngine
  → generation/lua/LuaGenerator
  → generation/assets/AssetGenerator
  → generation/validation/GameValidationEngine
  → simulation/core/GameSimulationEngine
  → simulation/agents/PlaytestAgent
  → economy/core/EconomyModelEngine
  → economy/simulation/EconomySimulationEngine
  → economy/detection/ImbalanceDetector
  → artifacts/GameArtifactBuilder
  → export/RobloxProjectCompiler
```

## Module Ownership

| Module         | Owner Domain   | Responsibility                          | Files |
| -------------- | -------------- | --------------------------------------- | ----- |
| agents/        | Core           | Agent framework + 13 implementations    | 16    |
| ai/            | Core           | LLM abstraction, prompts, routing       | 5     |
| artifacts/     | Generation     | Final output model                      | 2     |
| assembly/      | Assembly       | Roblox workspace building + persistence | 15    |
| cloud/         | Infrastructure | Remote node routing                     | 5     |
| collaboration/ | Collaboration  | Multi-agent AI coordination             | 7     |
| compiler/      | Compiler       | Production API + multi-project          | 8     |
| core/          | Infrastructure | Architecture enforcement                | 4     |
| distributed/   | Infrastructure | Job queue + workers                     | 5     |
| economy/       | Economy        | Balance analysis + patching             | 5     |
| evaluation/    | Evaluation     | Quality scoring + regression            | 9     |
| eventsource/   | Infrastructure | Event-sourced persistence               | 4     |
| execution/     | Core           | Pipeline integrator + types             | 11    |
| export/        | Generation     | Roblox project compiler                 | 1     |
| generation/    | Generation     | Blueprint + Lua + assets + validation   | 12    |
| governance/    | Governance     | CI/CD policies                          | 5     |
| lifecycle/     | Lifecycle      | Long-term game maintenance              | 6     |
| memory/        | Memory         | STM + LTM + semantic retrieval          | 11    |
| planning/      | Planning       | DAG-based task scheduling               | 11    |
| plugins/       | Plugins        | Sandboxed extension SDK                 | 5     |
| projects/      | API            | CRUD + game generation service          | 14    |
| providers/     | Core           | LLM provider implementations            | 4     |
| routes/        | API            | Express route handlers                  | 11    |
| simulation/    | Simulation     | Playtest + metrics + feedback           | 5     |
| socket/        | Infrastructure | SSE + Socket.io                         | 2     |
| studio/        | Studio         | Roblox Studio sync                      | 7     |
| types/         | Shared         | Core type definitions                   | 5     |
| validation/    | Governance     | Commit validation                       | 1     |
| world/         | World          | NPC + emergence + mutation              | 6     |

## Coupling Analysis

| High Coupling (5+ dependents)              | Reason                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `agents/core/AgentRegistry`                | Every pipeline uses executeAgent()                      |
| `execution/pipelineTypes`                  | Event types used by 20+ modules                         |
| `memory/core/MemoryEngine`                 | Used by simulation, economy, world, lifecycle, planning |
| `ai/provider` (interface)                  | All providers + agents depend on LLMProvider            |
| `generation/blueprint/GameBlueprintEngine` | Simulation, economy, world, export all consume it       |

| Low Coupling (0-1 dependents)    | Status           |
| -------------------------------- | ---------------- |
| `engine/GameGenerationEngine`    | DEAD — 0 imports |
| `pipeline/PipelineRunner`        | DEAD — 0 imports |
| `governance/orchestrator.ts`     | DEAD — 0 imports |
| `execution/incrementalGenerator` | DEAD — 0 imports |

## Architectural Smells

1. **Dual pipeline paths**: `execution/aiPipelineIntegrator` AND `planning/execution/PlanExecutor` both orchestrate agent execution
2. **Route proliferation**: 11 route files — some overlap (generation-v2 vs compile)
3. **Memory duplication**: `memory/MemoryManager` (v0.7 STM) alongside `memory/core/MemoryEngine` (v0.6 LTM) — two memory systems
4. **5 dead files** still present in tree
5. **governance/aiGovernance.ts** misplaced (commit splitting ≠ CI governance)

## Improvement Recommendations

1. **Remove dead code** (5 files, zero risk)
2. **Consolidate routes**: merge generation-v2 → compile, remove redundant game-generation
3. **Unify memory**: MemoryEngine should subsume MemoryManager role
4. **Clarify pipeline**: PlanExecutor is the canonical path; aiPipelineIntegrator serves the legacy service
5. **Move aiGovernance.ts → validation/**
