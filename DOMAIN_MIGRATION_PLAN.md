# Domain Migration Plan — Roblox AI Studio DevKit

## Target Architecture (DDD-aligned)

```
server/src/
├── core/                    ← Framework fundamentals
│   ├── agents/              (BaseAgent, AgentRegistry)
│   ├── ai/                  (provider, router, prompts, parser, factory)
│   ├── providers/           (openai, anthropic, gemini, ollama)
│   ├── types/               (shared type definitions)
│   └── architecture/        (policy, boundary, sandbox)
│
├── domains/
│   ├── planning/            (PlannerEngine, TaskGraph, PlanExecutor, PlanningEngine, PlanningRules)
│   ├── generation/          (Blueprint, Lua, Assets, Validation, Export, GameArtifact)
│   ├── evaluation/          (EvaluationEngine, Evaluator, Rules, Registry, Aggregator, Suite, Datasets)
│   ├── memory/              (MemoryEngine, Store, Semantic, Bridge, Index, ProjectMemory, Manager)
│   ├── simulation/          (SimulationEngine, PlaytestAgent, Metrics, Feedback, Bridge)
│   ├── economy/             (ModelEngine, SimEngine, Detector, BalanceGen, Bridge)
│   ├── world/               (WorldState, NPC, Interaction, Emergence, Mutation, Bridge)
│   ├── assembly/            (Builder, Diff, Replay, Impact, Persistence, Versioning, Registry)
│   ├── compiler/            (CompilerAPI, Orchestrator, ErrorBoundary, Telemetry, Guard, Projects)
│   ├── collaboration/       (AIAgentRegistry, Orchestrator, TaskEngine, Memory, Graph, EventBridge)
│   ├── lifecycle/           (Controller, LiveUpdate, AutoPatch, Evolution, HealthMonitor, Bridge)
│   └── governance/          (PolicyEngine, CIControlPipeline, PolicyRegistry)
│
├── infrastructure/
│   ├── distributed/         (JobQueue, Workers, Coordinator, Aggregator, Health)
│   ├── cloud/               (NodeRegistry, Dispatcher, Router, Topology, RemoteClient)
│   ├── eventsource/         (EventStore, Snapshots, StateReconstructor, Bootstrapper)
│   ├── socket/              (Streaming, RealtimeServer)
│   └── persistence/         (AssemblyPersistence, HistoryIndex)
│
├── api/
│   ├── routes/              (compile, evaluation, memory, planning, simulation, economy, world, lifecycle, projects)
│   └── middleware/          (errorHandler, cors)
│
├── studio/                  (sync, bridge, asset mapper, scene graph, importer)
├── plugins/                 (registry, sandbox, lifecycle, SDK, extensions)
└── index.ts                 (entrypoint — wires everything)
```

## File Mapping (Current → Target)

| Current Location                | Target Location                         | Reason                       |
| ------------------------------- | --------------------------------------- | ---------------------------- |
| `agents/core/*`                 | `core/agents/*`                         | Framework-level, not domain  |
| `agents/implementations/*`      | `core/agents/implementations/*`         | Agents are cross-domain      |
| `ai/*`                          | `core/ai/*`                             | Already correct conceptually |
| `providers/*`                   | `core/providers/*`                      | Already correct              |
| `types/*`                       | `core/types/*`                          | Already correct              |
| `core/architecture/*`           | `core/architecture/*`                   | No change                    |
| `core/ai/*`                     | `core/ai/sandbox.ts`                    | Merge into ai/               |
| `planning/*`                    | `domains/planning/*`                    | Domain module                |
| `generation/*`                  | `domains/generation/*`                  | Domain module                |
| `artifacts/*`                   | `domains/generation/artifacts/`         | Belongs with generation      |
| `export/*`                      | `domains/generation/export/`            | Belongs with generation      |
| `evaluation/*`                  | `domains/evaluation/*`                  | Domain module                |
| `memory/*`                      | `domains/memory/*`                      | Domain module                |
| `simulation/*`                  | `domains/simulation/*`                  | Domain module                |
| `economy/*`                     | `domains/economy/*`                     | Domain module                |
| `world/*`                       | `domains/world/*`                       | Domain module                |
| `assembly/*`                    | `domains/assembly/*`                    | Domain module                |
| `compiler/*`                    | `domains/compiler/*`                    | Domain module                |
| `collaboration/*`               | `domains/collaboration/*`               | Domain module                |
| `lifecycle/*`                   | `domains/lifecycle/*`                   | Domain module                |
| `governance/*`                  | `domains/governance/*`                  | Domain module                |
| `distributed/*`                 | `infrastructure/distributed/*`          | Infrastructure concern       |
| `cloud/*`                       | `infrastructure/cloud/*`                | Infrastructure concern       |
| `eventsource/*`                 | `infrastructure/eventsource/*`          | Infrastructure concern       |
| `socket/*`                      | `infrastructure/socket/*`               | Infrastructure concern       |
| `routes/*`                      | `api/routes/*`                          | API layer                    |
| `common/middleware/*`           | `api/middleware/*`                      | API layer                    |
| `projects/*`                    | `api/projects/*`                        | API/CRUD layer               |
| `studio/*`                      | `studio/*`                              | Standalone integration       |
| `plugins/*`                     | `plugins/*`                             | Standalone extension system  |
| `execution/*`                   | `core/execution/*`                      | Framework-level pipeline     |
| `validation/commitValidator.ts` | `domains/governance/commitValidator.ts` | Governance concern           |
| `governance/aiGovernance.ts`    | `domains/governance/aiGovernance.ts`    | Governance concern           |

## Migration Rules

1. Move one domain at a time
2. Update all import paths after each move
3. Verify `tsc --noEmit` passes after each move
4. No behavior changes — only file relocation
5. Each move is one atomic commit

## NOT MOVING (files are already correct)

- `index.ts` — stays at root
- `plugins/*` — already self-contained
- `studio/*` — already self-contained
