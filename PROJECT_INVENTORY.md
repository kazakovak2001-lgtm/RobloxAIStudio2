# PROJECT INVENTORY — Roblox AI Studio DevKit

**Generated**: 2026-07-06
**Total Source Files**: 259+ (205 server + 54 frontend)

---

## 1. Complete Folder Tree

```
RobloxAiStudio-DevKit/
├── .eslintrc.json
├── .gitignore
├── .github/workflows/ci.yml
├── .husky/commit-msg, pre-commit
├── .kiro/settings/, specs/, steering/
├── commitlint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
├── server/tsconfig.json
│
├── docs/
│   ├── adr/ (ADR-0001 through ADR-0008)
│   ├── AGENT_ARCHITECTURE.md
│   ├── AGENT_MERGE_REPORT.md
│   ├── API.md
│   └── ARCHITECTURE.md
│
├── scripts/
│   ├── validate-architecture.ts
│   └── git-boundary-guard.js
│
├── shared/
│   └── types.ts
│
├── src/ (Frontend — React/Vite SPA)
│   ├── App.tsx, main.tsx, styles.css, test.ts
│   ├── components/layout/ (Navbar, Sidebar)
│   ├── components/ui/ (Avatar, Badge, Breadcrumb, Button, Card, Dialog, Dropdown, Input, Loader, Modal, Pagination, Table, Tabs, Toast, Tooltip)
│   ├── constants/index.ts
│   ├── contexts/ (AuthContext, ToastProvider)
│   ├── features/workspace/ (Workspace, PipelineView, AgentBoard, AgentCard, ActivityFeed, CostMonitor, LiveConsole, ProgressTimeline, ProjectSummary, TokenUsage)
│   ├── hooks/ (index, useSocket)
│   ├── layouts/AppLayout.tsx
│   ├── pages/ (Dashboard, Landing, Login, Register, Projects, NewProject, ProjectDetail, Settings, AiEngineDemo)
│   ├── services/ (aiEngine, socket)
│   ├── types/index.ts
│   └── utils/cn.ts
│
└── server/src/ (Backend — Node/Express/AI Platform)
    ├── index.ts (entrypoint)
    ├── _quarantine/llm/LLMProvider.ts
    ├── agents/core/ (AgentRegistry, BaseAgent)
    ├── agents/implementations/ (13 agents)
    ├── ai/ (outputParser, promptTemplates, provider, providerFactory, router)
    ├── artifacts/ (GameArtifact, GameArtifactBuilder)
    ├── assembly/ (15 files: Builder, Diff, History, ChangeGraph, Impact, Persistence, Registry, Replay, Types, Validator, Versioning, DependencyResolver, FolderMapper, ScriptAssembler, WorkspaceBuilder)
    ├── cloud/ (CloudNodeRegistry, ClusterTopologyManager, NetworkDispatcher, NetworkJobRouter, RemoteWorkerClient)
    ├── collaboration/ (AIAgentRegistry, AgentEventBridge, AgentMemoryManager, AgentOrchestrator, AgentTaskEngine, CollaborationGraphEngine, CollaborationTypes)
    ├── common/middleware/errorHandler.ts
    ├── compiler/ (CompilerAPI, CompilerContextManager, CompilerErrorBoundary, CompilerOrchestrator, CompilerTelemetry, ExecutionGuard, ProjectIsolationLayer, ProjectRegistry)
    ├── core/ai/GenerationSandbox.ts
    ├── core/architecture/ (ArchitecturePolicy, BoundaryValidator, RuntimeBoundaryGuard)
    ├── distributed/ (CompilerWorkerNode, DistributedExecutionCoordinator, JobQueueManager, JobResultAggregator, WorkerHealthMonitor)
    ├── economy/ (core/EconomyModelEngine, simulation/EconomySimulationEngine, detection/ImbalanceDetector, balancing/BalanceGenerator, bridge/EconomyFeedbackBridge)
    ├── engine/GameGenerationEngine.ts [DEAD]
    ├── evaluation/ (core/EvaluationEngine, agents/AgentEvaluator, analytics/EvaluationAggregator, datasets/PromptDataset, regression/EvaluationSuite, EvaluationRegistry, EvaluationResult, EvaluationRules, Evaluator)
    ├── eventsource/ (EventStore, PersistentClusterBootstrapper, SnapshotManager, StateReconstructor)
    ├── execution/ (aiPipelineIntegrator, blueprintAssembler, executionQueue, gameDiversityEngine, gameGenerationResultAggregator, incrementalGenerator[DEAD], pipelineEngine[DEAD], pipelineTypes, retryPolicy, stepRunner, workflowState)
    ├── export/RobloxProjectCompiler.ts
    ├── generation/ (blueprint/GameBlueprintEngine, lua/LuaGenerator, assets/AssetGenerator, validation/GameValidationEngine, export/RobloxExportBuilder, BlueprintValidator, GenerationBlueprint, GenerationManifest, GenerationPipeline, GenerationRegistry, GenerationReport, GenerationTypes)
    ├── governance/ (CIControlPipeline, GovernancePolicyEngine, PolicyRegistry, aiGovernance.ts, orchestrator.ts[DEAD])
    ├── lifecycle/ (core/GameLifecycleController, live/LiveUpdateEngine, patch/AutoPatchGenerator, evolution/ContinuousEvolutionEngine, monitor/GameHealthMonitor, bridge/LifecycleFeedbackBridge)
    ├── memory/ (core/MemoryEngine, store/MemoryStore, semantic/SemanticRetriever, agents/AgentMemoryBridge, indexing/MemoryIndex, MemoryManager, MemoryRegistry, MemorySerializer, MemoryTypes, ProjectContext, ProjectMemory)
    ├── pipeline/PipelineRunner.ts [DEAD]
    ├── planning/ (core/PlannerEngine, execution/PlanExecutor, model/TaskGraph, ExecutionPlan, PlanningContext, PlanningEngine, PlanningMetrics, PlanningRegistry, PlanningRules, PlanningTypes)
    ├── plugins/ (ExtensionPointManager, PluginLifecycleManager, PluginRegistry, PluginSandbox, PluginSDK)
    ├── projects/ (cache, controllers, dto, repository, services, types, validation)
    ├── providers/ (anthropic, gemini, ollama, openai)
    ├── routes/ (compile, economy, evaluation, game-generation, generation-v2, lifecycle, memory, planning, projects, simulation, world)
    ├── simulation/ (core/GameSimulationEngine, agents/PlaytestAgent, metrics/GameplayMetricsEngine, feedback/SimulationFeedbackEngine, bridge/GenerationRefinementBridge)
    ├── socket/ (index, streaming)
    ├── studio/ (SceneGraphTranslator, StudioAssetMapper, StudioBridgeServer, StudioProjectImporter, StudioRealtimeSyncManager, StudioSyncEngine, StudioTypes)
    ├── types/ (ai, blueprint, game-generation-result, gameDesignSeed, index)
    ├── validation/commitValidator.ts
    └── world/ (core/WorldStateEngine, npc/NPCBehaviorEngine, interaction/InteractionGraphEngine, emergence/EmergentBehaviorEngine, mutation/WorldMutationEngine, bridge/WorldSimulationBridge)
```

---

## 2. All TypeScript Files (205 server + 54 frontend = 259)

### Server (`server/src/`) — 205 files

#### agents/ (16)

- `agents/core/AgentRegistry.ts`
- `agents/core/BaseAgent.ts`
- `agents/implementations/AssetPlannerAgent.ts`
- `agents/implementations/DatabaseAgent.ts`
- `agents/implementations/DebugAgent.ts`
- `agents/implementations/DocumentationAgent.ts`
- `agents/implementations/GameDesignerAgent.ts`
- `agents/implementations/LuaGeneratorAgent.ts`
- `agents/implementations/OrchestratorAgent.ts`
- `agents/implementations/PerformanceAgent.ts`
- `agents/implementations/PlannerAgent.ts`
- `agents/implementations/RequirementsAgent.ts`
- `agents/implementations/RobloxArchitectAgent.ts`
- `agents/implementations/TesterAgent.ts`
- `agents/implementations/UIGeneratorAgent.ts`
- `_quarantine/llm/LLMProvider.ts`

#### ai/ (5)

- `ai/outputParser.ts`
- `ai/promptTemplates.ts`
- `ai/provider.ts`
- `ai/providerFactory.ts`
- `ai/router.ts`

#### artifacts/ (2)

- `artifacts/GameArtifact.ts`
- `artifacts/GameArtifactBuilder.ts`

#### assembly/ (15)

- `assembly/AssemblyBuilder.ts`
- `assembly/AssemblyChangeGraph.ts`
- `assembly/AssemblyDiffEngine.ts`
- `assembly/AssemblyHistoryIndex.ts`
- `assembly/AssemblyImpactAnalyzer.ts`
- `assembly/AssemblyPersistenceStore.ts`
- `assembly/AssemblyRegistry.ts`
- `assembly/AssemblyReplayEngine.ts`
- `assembly/AssemblyTypes.ts`
- `assembly/AssemblyValidator.ts`
- `assembly/AssemblyVersioning.ts`
- `assembly/DependencyResolver.ts`
- `assembly/FolderMapper.ts`
- `assembly/ScriptAssembler.ts`
- `assembly/WorkspaceBuilder.ts`

#### cloud/ (5)

- `cloud/CloudNodeRegistry.ts`
- `cloud/ClusterTopologyManager.ts`
- `cloud/NetworkDispatcher.ts`
- `cloud/NetworkJobRouter.ts`
- `cloud/RemoteWorkerClient.ts`

#### collaboration/ (7)

- `collaboration/AIAgentRegistry.ts`
- `collaboration/AgentEventBridge.ts`
- `collaboration/AgentMemoryManager.ts`
- `collaboration/AgentOrchestrator.ts`
- `collaboration/AgentTaskEngine.ts`
- `collaboration/CollaborationGraphEngine.ts`
- `collaboration/CollaborationTypes.ts`

#### compiler/ (8)

- `compiler/CompilerAPI.ts`
- `compiler/CompilerContextManager.ts`
- `compiler/CompilerErrorBoundary.ts`
- `compiler/CompilerOrchestrator.ts`
- `compiler/CompilerTelemetry.ts`
- `compiler/ExecutionGuard.ts`
- `compiler/ProjectIsolationLayer.ts`
- `compiler/ProjectRegistry.ts`

#### core/ (4)

- `core/ai/GenerationSandbox.ts`
- `core/architecture/ArchitecturePolicy.ts`
- `core/architecture/BoundaryValidator.ts`
- `core/architecture/RuntimeBoundaryGuard.ts`

#### distributed/ (5)

- `distributed/CompilerWorkerNode.ts`
- `distributed/DistributedExecutionCoordinator.ts`
- `distributed/JobQueueManager.ts`
- `distributed/JobResultAggregator.ts`
- `distributed/WorkerHealthMonitor.ts`

#### economy/ (5)

- `economy/balancing/BalanceGenerator.ts`
- `economy/bridge/EconomyFeedbackBridge.ts`
- `economy/core/EconomyModelEngine.ts`
- `economy/detection/ImbalanceDetector.ts`
- `economy/simulation/EconomySimulationEngine.ts`

#### evaluation/ (9)

- `evaluation/agents/AgentEvaluator.ts`
- `evaluation/analytics/EvaluationAggregator.ts`
- `evaluation/core/EvaluationEngine.ts`
- `evaluation/datasets/PromptDataset.ts`
- `evaluation/EvaluationRegistry.ts`
- `evaluation/EvaluationResult.ts`
- `evaluation/EvaluationRules.ts`
- `evaluation/Evaluator.ts`
- `evaluation/regression/EvaluationSuite.ts`

#### eventsource/ (4)

- `eventsource/EventStore.ts`
- `eventsource/PersistentClusterBootstrapper.ts`
- `eventsource/SnapshotManager.ts`
- `eventsource/StateReconstructor.ts`

#### execution/ (11)

- `execution/aiPipelineIntegrator.ts`
- `execution/blueprintAssembler.ts`
- `execution/executionQueue.ts`
- `execution/gameDiversityEngine.ts`
- `execution/gameGenerationResultAggregator.ts`
- `execution/incrementalGenerator.ts` [DEAD]
- `execution/pipelineEngine.ts` [DEAD]
- `execution/pipelineTypes.ts`
- `execution/retryPolicy.ts`
- `execution/stepRunner.ts`
- `execution/workflowState.ts`

#### export/ (1)

- `export/RobloxProjectCompiler.ts`

#### generation/ (12)

- `generation/assets/AssetGenerator.ts`
- `generation/blueprint/GameBlueprintEngine.ts`
- `generation/BlueprintValidator.ts`
- `generation/export/RobloxExportBuilder.ts`
- `generation/GenerationBlueprint.ts`
- `generation/GenerationManifest.ts`
- `generation/GenerationPipeline.ts`
- `generation/GenerationRegistry.ts`
- `generation/GenerationReport.ts`
- `generation/GenerationTypes.ts`
- `generation/lua/LuaGenerator.ts`
- `generation/validation/GameValidationEngine.ts`

#### governance/ (5)

- `governance/aiGovernance.ts`
- `governance/CIControlPipeline.ts`
- `governance/GovernancePolicyEngine.ts`
- `governance/orchestrator.ts` [DEAD]
- `governance/PolicyRegistry.ts`

#### lifecycle/ (6)

- `lifecycle/bridge/LifecycleFeedbackBridge.ts`
- `lifecycle/core/GameLifecycleController.ts`
- `lifecycle/evolution/ContinuousEvolutionEngine.ts`
- `lifecycle/live/LiveUpdateEngine.ts`
- `lifecycle/monitor/GameHealthMonitor.ts`
- `lifecycle/patch/AutoPatchGenerator.ts`

#### memory/ (11)

- `memory/agents/AgentMemoryBridge.ts`
- `memory/core/MemoryEngine.ts`
- `memory/indexing/MemoryIndex.ts`
- `memory/MemoryManager.ts`
- `memory/MemoryRegistry.ts`
- `memory/MemorySerializer.ts`
- `memory/MemoryTypes.ts`
- `memory/ProjectContext.ts`
- `memory/ProjectMemory.ts`
- `memory/semantic/SemanticRetriever.ts`
- `memory/store/MemoryStore.ts`

#### planning/ (11)

- `planning/core/PlannerEngine.ts`
- `planning/execution/PlanExecutor.ts`
- `planning/ExecutionPlan.ts`
- `planning/model/TaskGraph.ts`
- `planning/PlanningContext.ts`
- `planning/PlanningEngine.ts`
- `planning/PlanningMetrics.ts`
- `planning/PlanningRegistry.ts`
- `planning/PlanningRules.ts`
- `planning/PlanningTypes.ts`

#### plugins/ (5)

- `plugins/ExtensionPointManager.ts`
- `plugins/PluginLifecycleManager.ts`
- `plugins/PluginRegistry.ts`
- `plugins/PluginSandbox.ts`
- `plugins/PluginSDK.ts`

#### projects/ (12)

- `projects/cache/blueprint.cache.ts`
- `projects/controllers/project.controller.ts`
- `projects/dto/blueprint.dto.ts`
- `projects/dto/createProject.dto.ts`
- `projects/dto/index.ts`
- `projects/dto/project.dto.ts`
- `projects/repository/blueprint.repository.ts`
- `projects/repository/inMemoryProject.repository.ts`
- `projects/repository/project.repository.ts`
- `projects/services/blueprint.validator.ts`
- `projects/services/game-generation.service.ts`
- `projects/services/project.service.ts`
- `projects/types/blueprint.ts`
- `projects/validation/project.validation.ts`

#### providers/ (4)

- `providers/anthropic.ts`
- `providers/gemini.ts`
- `providers/ollama.ts`
- `providers/openai.ts`

#### routes/ (11)

- `routes/compile.ts`
- `routes/economy.ts`
- `routes/evaluation.ts`
- `routes/game-generation.ts`
- `routes/generation-v2.ts`
- `routes/lifecycle.ts`
- `routes/memory.ts`
- `routes/planning.ts`
- `routes/projects.ts`
- `routes/simulation.ts`
- `routes/world.ts`

#### simulation/ (5)

- `simulation/agents/PlaytestAgent.ts`
- `simulation/bridge/GenerationRefinementBridge.ts`
- `simulation/core/GameSimulationEngine.ts`
- `simulation/feedback/SimulationFeedbackEngine.ts`
- `simulation/metrics/GameplayMetricsEngine.ts`

#### socket/ (2)

- `socket/index.ts`
- `socket/streaming.ts`

#### studio/ (7)

- `studio/SceneGraphTranslator.ts`
- `studio/StudioAssetMapper.ts`
- `studio/StudioBridgeServer.ts`
- `studio/StudioProjectImporter.ts`
- `studio/StudioRealtimeSyncManager.ts`
- `studio/StudioSyncEngine.ts`
- `studio/StudioTypes.ts`

#### types/ (5)

- `types/ai.ts`
- `types/blueprint.ts`
- `types/game-generation-result.ts`
- `types/gameDesignSeed.ts`
- `types/index.ts`

#### other (3)

- `common/middleware/errorHandler.ts`
- `engine/GameGenerationEngine.ts` [DEAD]
- `pipeline/PipelineRunner.ts` [DEAD]
- `validation/commitValidator.ts`
- `index.ts` (entrypoint)

### Frontend (`src/`) — 54 files

Listed in Section 1 above.

---

## 3. JSON Configuration Files

| File                      | Purpose                          |
| ------------------------- | -------------------------------- |
| `package.json`            | Project deps + scripts           |
| `tsconfig.json`           | Frontend TypeScript config       |
| `server/tsconfig.json`    | Backend TypeScript config        |
| `.eslintrc.json`          | ESLint boundary rules            |
| `.kiro/settings/mcp.json` | Kiro MCP config                  |
| `.kiro/spec.yaml`         | Kiro spec                        |
| `commitlint.config.js`    | Conventional commits enforcement |
| `postcss.config.js`       | PostCSS                          |
| `tailwind.config.js`      | Tailwind CSS                     |
| `vite.config.ts`          | Vite bundler                     |

---

## 4. Markdown Documents

| File                                         | Purpose                             |
| -------------------------------------------- | ----------------------------------- |
| `ARCHITECTURE_AUDIT.md`                      | v1.3.1 full architecture audit      |
| `ARCHITECTURE_REFACTOR_PLAN.md`              | Phased refactor plan                |
| `CODE_HEALTH_REPORT.md`                      | v1.3.3 code health (87/100)         |
| `IMPLEMENTATION_COMPLETE.md`                 | Early implementation notes          |
| `IMPLEMENTATION_SUMMARY.md`                  | Early summary                       |
| `PROJECT_ARCHITECTURE_REPORT.md`             | Full architecture analysis (91/100) |
| `QUICK_REFERENCE.md`                         | Quick reference                     |
| `REPOSITORY_MAP.md`                          | Folder-by-folder inventory          |
| `STATIC_ANALYSIS_REPORT.md`                  | Static analysis findings            |
| `TECHNICAL_DEBT_REPORT.md`                   | Tech debt inventory                 |
| `TODO.md`                                    | Task list                           |
| `docs/API.md`                                | API reference                       |
| `docs/ARCHITECTURE.md`                       | Architecture overview               |
| `docs/AGENT_ARCHITECTURE.md`                 | Agent hierarchy                     |
| `docs/AGENT_MERGE_REPORT.md`                 | Agent consolidation report          |
| `docs/adr/ADR-0001-template.md`              | ADR template                        |
| `docs/adr/ADR-0002-orchestrator-core.md`     | Orchestrator decision               |
| `docs/adr/ADR-0003-ai-router.md`             | AI router decision                  |
| `docs/adr/ADR-0004-evaluation-layer.md`      | Evaluation decision                 |
| `docs/adr/ADR-0005-shared-project-memory.md` | Memory decision                     |
| `docs/adr/ADR-0006-autonomous-planning.md`   | Planning decision                   |
| `docs/adr/ADR-0007-generation-pipeline.md`   | Generation decision                 |
| `docs/adr/ADR-0008-project-assembly.md`      | Assembly decision                   |

---

## 5. Scripts

| File                               | Purpose                         |
| ---------------------------------- | ------------------------------- |
| `scripts/validate-architecture.ts` | CI pre-build boundary validator |
| `scripts/git-boundary-guard.js`    | Git pre-commit guard            |

---

## 6. Packages (dependencies)

**Runtime**: express, framer-motion, lucide-react, react, react-dom, react-router-dom, socket.io, socket.io-client

**Dev**: @types/express, @types/node, @types/react, @types/react-dom, @types/socket.io-client, @vitejs/plugin-react, autoprefixer, postcss, tailwindcss, tsx, typescript, vite

---

## 7. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  /api/compile (MVP Endpoint)                             │
│  Goal → Plan → Generate → Validate → Simulate →         │
│  Economy → World → Artifact → Roblox Project             │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  Core Pipeline (server/src/)                             │
│                                                          │
│  Planning    → 13 Agents (LLM-driven)                   │
│  Evaluation  → Quality scoring + regression              │
│  Memory      → STM + LTM + Semantic retrieval            │
│  Generation  → Blueprint → Lua → Assets → Validation     │
│  Simulation  → Playtest + Metrics + Feedback             │
│  Economy     → Model → Simulate → Detect → Balance       │
│  World       → NPC AI → Interactions → Emergence         │
│  Lifecycle   → Health → Patches → Evolution              │
│  Assembly    → Roblox services → Persistence → Diff      │
│  Governance  → CI/CD policies → Impact analysis          │
│  Compiler    → Multi-project + Distributed + Cloud       │
│  Plugins     → Sandboxed extensions                      │
│  EventSource → Immutable log → State reconstruction      │
│  Studio      → Bidirectional Roblox Studio sync          │
│  Collaboration → Multi-agent AI coordination             │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Module Relationships (Dependency Direction)

```
CompilerAPI → CompilerOrchestrator → ExecutionGuard + ErrorBoundary
  → AssemblyBuilder → FolderMapper + ScriptAssembler + WorkspaceBuilder
    → AssemblyValidator → AssemblyRegistry (persistence)
  → AIPipelineIntegrator → PlanningEngine → AgentRegistry → Agents → LLM Providers
  → EvaluationRegistry → Evaluator → EvaluationRules
  → MemoryRegistry → ProjectMemory → MemorySerializer
  → GovernancePolicyEngine → CIControlPipeline
  → GenerationPipeline → BlueprintValidator → GenerationRegistry

GameArtifactBuilder ← all pipeline stage outputs
  → RobloxProjectCompiler (MVP export)

Frontend (src/) → HTTP fetch → Backend routes (/api/*)
  → Socket.io client → PipelineEventEmitter (real-time)
```

---

## 9. Dead Code (documented, not removed)

| File                                           | Reason                             |
| ---------------------------------------------- | ---------------------------------- |
| `server/src/engine/GameGenerationEngine.ts`    | Redundant composition root         |
| `server/src/pipeline/PipelineRunner.ts`        | Superseded by aiPipelineIntegrator |
| `server/src/execution/pipelineEngine.ts`       | 3-line re-export shim              |
| `server/src/execution/incrementalGenerator.ts` | Never imported                     |
| `server/src/governance/orchestrator.ts`        | Speculative interfaces             |
| `server/src/_quarantine/llm/LLMProvider.ts`    | Superseded by providers/           |
