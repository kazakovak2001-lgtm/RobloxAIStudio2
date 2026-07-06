# Repository Map — Roblox AI Studio DevKit

## Frontend (`src/`)

React + Vite application.

| Folder                    | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `src/components/layout/`  | App shell: Navbar                                                |
| `src/components/ui/`      | Reusable UI primitives: Button, Card                             |
| `src/constants/`          | Global constants                                                 |
| `src/contexts/`           | React contexts: Auth, Toast                                      |
| `src/features/workspace/` | Workspace feature module                                         |
| `src/hooks/`              | Custom hooks: `useSocket`                                        |
| `src/layouts/`            | Page layouts: AppLayout                                          |
| `src/pages/`              | Route pages: Dashboard, Projects, Settings, AI Engine Demo, etc. |
| `src/services/`           | API client services: `aiEngine.ts`, `socket.ts`                  |
| `src/types/`              | Frontend TypeScript types                                        |
| `src/utils/`              | Utilities: `cn.ts` (classnames helper)                           |

## Backend (`server/src/`)

Express + Socket.io server. TypeScript compiled via tsx.

| Folder                               | Purpose                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/src/agents/core/`            | `BaseAgent`, `AgentRegistry` — canonical agent framework                                                                                                                                                     |
| `server/src/agents/implementations/` | 13 agent implementations (Requirements→Orchestrator)                                                                                                                                                         |
| `server/src/ai/`                     | LLM abstraction: `provider.ts`, `router.ts`, `providerFactory.ts`, `promptTemplates.ts`, `outputParser.ts`                                                                                                   |
| `server/src/assembly/`               | Project Assembly: Builder, Validator, FolderMapper, ScriptAssembler, WorkspaceBuilder, Persistence, Versioning, Diff, Replay, Impact, ChangeGraph, DependencyResolver                                        |
| `server/src/cloud/`                  | Cloud network: CloudNodeRegistry, NetworkDispatcher, RemoteWorkerClient, NetworkJobRouter, ClusterTopologyManager                                                                                            |
| `server/src/common/middleware/`      | Express middleware: errorHandler                                                                                                                                                                             |
| `server/src/compiler/`               | Production compiler platform: CompilerAPI, CompilerOrchestrator, ExecutionGuard, ErrorBoundary, Telemetry, ProjectRegistry, ContextManager, IsolationLayer                                                   |
| `server/src/distributed/`            | Job-based execution: JobQueueManager, CompilerWorkerNode, DistributedExecutionCoordinator, JobResultAggregator, WorkerHealthMonitor                                                                          |
| `server/src/engine/`                 | **Legacy** standalone GameGenerationEngine wrapper                                                                                                                                                           |
| `server/src/evaluation/`             | Quality control: Evaluator, EvaluationRules, EvaluationRegistry, EvaluationResult types                                                                                                                      |
| `server/src/execution/`              | Pipeline execution: AIPipelineIntegrator, pipelineTypes, retryPolicy, workflowState, stepRunner, blueprintAssembler, gameDiversityEngine, resultAggregator, incrementalGenerator, pipelineEngine (re-export) |
| `server/src/generation/`             | Generation pipeline: GenerationPipeline, GenerationBlueprint, BlueprintValidator, GenerationManifest, GenerationReport, GenerationRegistry, GenerationTypes                                                  |
| `server/src/governance/`             | CI/CD governance: GovernancePolicyEngine, PolicyRegistry, CIControlPipeline + **legacy** aiGovernance.ts, orchestrator.ts                                                                                    |
| `server/src/llm/`                    | **Legacy** LLMProvider implementations (duplicated in providers/)                                                                                                                                            |
| `server/src/memory/`                 | Shared project memory: ProjectMemory, MemoryManager, MemoryRegistry, MemorySerializer, ProjectContext, MemoryTypes                                                                                           |
| `server/src/pipeline/`               | **Legacy** PipelineRunner (superseded by execution/stepRunner + AIPipelineIntegrator)                                                                                                                        |
| `server/src/planning/`               | Autonomous planning: PlanningEngine, PlanningRules, ExecutionPlan, PlanningMetrics, PlanningRegistry, PlanningContext, PlanningTypes                                                                         |
| `server/src/projects/`               | Project CRUD: controllers, services, repository, cache, dto, validation, types                                                                                                                               |
| `server/src/providers/`              | LLM provider implementations: openai, anthropic, gemini, ollama                                                                                                                                              |
| `server/src/routes/`                 | Express routes: projects, game-generation                                                                                                                                                                    |
| `server/src/socket/`                 | Socket.io: RealtimeServer, StreamingUpdateHandler, PipelineEventEmitter                                                                                                                                      |
| `server/src/types/`                  | Shared types: AgentInput/Output, blueprint, GameDesignSeed, GameGenerationResult, AI types                                                                                                                   |
| `server/src/validation/`             | Commit validation utilities (aiGovernance support)                                                                                                                                                           |

## Agents (`agents/`)

**Legacy** standalone agent framework (predates `server/src/agents/`). Not used by the production pipeline.

| File                                     | Purpose                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `agents/base/AgentBase.ts`               | Original base class (different API from server/src/agents/core/BaseAgent.ts)                   |
| `agents/agents/*.ts`                     | 13 agent stubs (older versions, not imported by server/)                                       |
| `agents/orchestrator/Orchestrator.ts`    | Standalone orchestrator (superseded by server/src/agents/implementations/OrchestratorAgent.ts) |
| `agents/providers/LocalModelProvider.ts` | Local model wrapper (superseded by server/src/providers/)                                      |

## Documentation (`docs/`)

| File                            | Purpose                       |
| ------------------------------- | ----------------------------- |
| `docs/API.md`                   | API reference                 |
| `docs/ARCHITECTURE.md`          | Architecture overview         |
| `docs/adr/ADR-0001-template.md` | ADR template                  |
| `docs/adr/ADR-0002..0008`       | Architecture decision records |

## Configuration

| File                   | Purpose                |
| ---------------------- | ---------------------- |
| `.gitignore`           | Git exclusions         |
| `package.json`         | Project deps + scripts |
| `tsconfig.json`        | Frontend TS config     |
| `server/tsconfig.json` | Backend TS config      |
| `vite.config.ts`       | Vite bundler config    |
| `postcss.config.js`    | PostCSS/Tailwind       |
| `tailwind.config.js`   | Tailwind CSS           |
| `commitlint.config.js` | Commit message linting |

## Generated / Runtime (not tracked)

| Path            | Purpose                           |
| --------------- | --------------------------------- |
| `dist/`         | Vite build output (gitignored)    |
| `storage/`      | Assembly persistence (gitignored) |
| `node_modules/` | Dependencies (gitignored)         |
