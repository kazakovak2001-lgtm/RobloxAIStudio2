# Module Status Classification — Roblox AI Studio DevKit

## Stable (Production-ready, well-tested by usage)

| Module                   | Files | Since | Justification                                                      |
| ------------------------ | ----- | ----- | ------------------------------------------------------------------ |
| `agents/`                | 16    | v0.2  | Core framework, 13 LLM agents, battle-tested across all milestones |
| `ai/`                    | 5     | v0.3  | Provider abstraction, prompt templates, output parser — stable API |
| `providers/`             | 4     | v0.4  | OpenAI/Anthropic/Gemini/Ollama — unchanged since creation          |
| `evaluation/` (root)     | 4     | v0.6  | Structural validation, EvaluationRules, Registry — pipeline gate   |
| `memory/` (root-level)   | 6     | v0.7  | ProjectMemory, MemoryManager — per-execution STM                   |
| `planning/` (root-level) | 7     | v0.8  | PlanningEngine, PlanningRules, ExecutionPlan — pipeline scheduling |
| `execution/`             | 7*    | v0.3  | aiPipelineIntegrator, pipelineTypes, retryPolicy — core runtime    |
| `projects/`              | 14    | v0.2  | CRUD, repository, services — stable Express layer                  |
| `socket/`                | 2     | v0.2  | SSE + Socket.io streaming — unchanged                              |
| `types/`                 | 5     | v0.2  | Core type definitions — stable contracts                           |

*excluding 4 dead files

## Needs Refactoring (Functional but has architectural issues)

| Module        | Files | Issue                                                                         | Recommended Action                                    |
| ------------- | ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `routes/`     | 11    | Too many route files; overlap between game-generation, generation-v2, compile | Consolidate to 6 routes                               |
| `generation/` | 12    | Two export paths (RobloxExportBuilder + RobloxProjectCompiler)                | Unify under artifacts/                                |
| `governance/` | 5     | Contains misplaced aiGovernance.ts + dead orchestrator.ts                     | Move aiGovernance to correct domain; delete dead file |
| `assembly/`   | 15    | Large module with mixed concerns (building + persistence + analysis)          | Split: assembly-build/ + assembly-analysis/           |

## Experimental (Recently added, less battle-tested)

| Module           | Files | Since | Justification                                                          |
| ---------------- | ----- | ----- | ---------------------------------------------------------------------- |
| `simulation/`    | 5     | v1.1  | Tick-based simulation — functional but heuristic-heavy                 |
| `economy/`       | 5     | v1.2  | Economy modeling — functional but uses simple heuristics               |
| `world/`         | 6     | v1.3  | NPC behavior + emergence — rule-based, needs real-world validation     |
| `lifecycle/`     | 6     | v1.4  | Self-evolution system — powerful but untested at scale                 |
| `collaboration/` | 7     | v1.7  | Multi-agent coordination — structural, not yet exercised in production |
| `studio/`        | 7     | v1.6  | Roblox Studio sync — structural, requires real Studio plugin to test   |
| `eventsource/`   | 4     | v1.4  | Event store — structural, file-based, needs load testing               |
| `cloud/`         | 5     | v1.3  | Remote node routing — structural, requires network to test             |
| `distributed/`   | 5     | v1.2  | Job queue + workers — structural, single-process tested only           |
| `plugins/`       | 5     | v1.5  | Plugin SDK — structural, no third-party plugins exist yet              |

## Deprecated (Marked for removal)

| Module                              | Files | Reason                                        |
| ----------------------------------- | ----- | --------------------------------------------- |
| `engine/`                           | 1     | Dead — GameGenerationEngine never used        |
| `pipeline/`                         | 1     | Dead — PipelineRunner superseded              |
| `_quarantine/llm/`                  | 1     | Dead — quarantined, confirmed zero references |
| `execution/pipelineEngine.ts`       | 1     | Dead — re-export shim                         |
| `execution/incrementalGenerator.ts` | 1     | Dead — never imported                         |
| `governance/orchestrator.ts`        | 1     | Dead — speculative interfaces                 |

## Summary

| Category          | Modules | Files |
| ----------------- | ------- | ----- |
| Stable            | 10      | ~75   |
| Needs Refactoring | 4       | ~43   |
| Experimental      | 10      | ~55   |
| Deprecated        | 6       | 6     |
