# Project Architecture Report — Roblox AI Studio DevKit

**Generated**: 2026-07-06
**Version**: v1.7 (post v1.6.2 enforcement)

---

## 1. STRUCTURE OVERVIEW

```
Frontend root:  /src            (React + Vite SPA)
Backend root:   /server/src     (Node + Express + AI compiler platform)
Shared root:    /shared         (Types/contracts only)
```

### File Counts

| Zone          | Files        | Purpose                            |
| ------------- | ------------ | ---------------------------------- |
| `server/src/` | ~95 .ts      | Backend compiler platform          |
| `src/`        | ~55 .ts/.tsx | Frontend React SPA                 |
| `shared/`     | 1 .ts        | Shared type contracts              |
| `scripts/`    | 2 files      | Architecture validator + git guard |
| `docs/`       | ~12 files    | ADRs + architecture docs           |

### Backend Modules (`server/src/`)

```
agents/          — 13 AI agents + BaseAgent + AgentRegistry
ai/              — LLM abstraction: provider, router, promptTemplates, outputParser, providerFactory
assembly/        — Project assembly: builder, validator, persistence, versioning, diff, replay, impact
cloud/           — Cloud execution: node registry, dispatcher, router, topology
collaboration/   — Multi-agent AI: orchestrator, task engine, memory, graph, event bridge
common/          — Express middleware (errorHandler)
compiler/        — Production API: CompilerAPI, Orchestrator, ErrorBoundary, Telemetry, ProjectRegistry, Isolation
core/            — Architecture enforcement: policy, boundary validator, runtime guard, AI sandbox
distributed/     — Job queue, worker nodes, coordinator, aggregator, health monitor
engine/          — [DEAD] Legacy GameGenerationEngine
evaluation/      — Quality control: Evaluator, Rules, Registry
eventsource/     — Event store, snapshots, state reconstructor, bootstrapper
execution/       — Pipeline integrator, pipelineTypes, retryPolicy, workflowState, stepRunner, [DEAD: pipelineEngine, incrementalGenerator]
generation/      — Generation pipeline: blueprint, manifest, report, registry
governance/      — CI/CD: policy engine, CIControlPipeline, [DEAD: orchestrator.ts], aiGovernance
llm/             — [DEAD] Legacy LLMProvider (superseded by providers/)
memory/          — Shared project memory: ProjectMemory, MemoryManager, Registry, Serializer
pipeline/        — [DEAD] Legacy PipelineRunner
planning/        — Autonomous planning: engine, rules, plan, metrics, registry
plugins/         — Plugin SDK: registry, sandbox, lifecycle, extension points
projects/        — Project CRUD: controllers, services, repository, cache, dto, validation
providers/       — LLM implementations: openai, anthropic, gemini, ollama
routes/          — Express routes: projects, game-generation
socket/          — Socket.io: RealtimeServer, StreamingUpdateHandler, PipelineEventEmitter
studio/          — Roblox Studio integration: sync engine, bridge, asset mapper, scene graph, importer
types/           — Shared backend types: AgentInput/Output, blueprint, GameDesignSeed
validation/      — Commit validator (governance support)
```

### Frontend Modules (`src/`)

```
components/      — layout/ (Navbar), ui/ (Button, Card)
constants/       — Global constants
contexts/        — AuthContext, ToastProvider
features/        — workspace/ (AgentBoard, etc.)
hooks/           — useSocket
layouts/         — AppLayout
pages/           — Dashboard, Projects, Settings, AI Demo, Login, Register, etc.
services/        — aiEngine (HTTP client), socket
types/           — Frontend types
utils/           — cn (classnames helper)
```

---

## 2. DOMAIN CLASSIFICATION

### Frontend Domain (Browser runtime)

| Module            | Role                           |
| ----------------- | ------------------------------ |
| `src/pages/`      | Route pages (React components) |
| `src/components/` | Reusable UI primitives         |
| `src/hooks/`      | Custom hooks (useSocket)       |
| `src/contexts/`   | React contexts (Auth, Toast)   |
| `src/services/`   | HTTP API clients (fetch-based) |
| `src/features/`   | Feature modules (workspace)    |
| `src/layouts/`    | Page layouts                   |
| `src/utils/`      | Pure utilities                 |

### Backend Domain (Node runtime)

| Module                      | Role                                             |
| --------------------------- | ------------------------------------------------ |
| `server/src/compiler/`      | Public CompilerAPI + orchestration               |
| `server/src/agents/`        | 13 AI agents + BaseAgent + Registry              |
| `server/src/execution/`     | Pipeline integrator (core execution)             |
| `server/src/planning/`      | Autonomous plan-driven scheduling                |
| `server/src/evaluation/`    | Quality scoring per step                         |
| `server/src/memory/`        | Shared project memory during execution           |
| `server/src/generation/`    | Blueprint finalization + manifest + report       |
| `server/src/assembly/`      | Workspace building + persistence + diff + impact |
| `server/src/governance/`    | CI/CD policy engine                              |
| `server/src/distributed/`   | Job queue + worker pool                          |
| `server/src/cloud/`         | Remote node routing                              |
| `server/src/collaboration/` | Multi-agent AI coordination                      |
| `server/src/eventsource/`   | Event-sourced state persistence                  |
| `server/src/plugins/`       | Sandboxed plugin SDK                             |
| `server/src/studio/`        | Roblox Studio integration                        |
| `server/src/providers/`     | LLM provider implementations                     |

### Shared Domain (No runtime)

| Module            | Role                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| `shared/types.ts` | Type contracts: ApiResponse, ExecutionStatus, StepStatus, LLMMode, ProjectStatus |

---

## 3. DEPENDENCY GRAPH SUMMARY

### Valid Import Directions

```
Frontend (src/) → HTTP API only (fetch /api/*)
Frontend (src/) → Socket.io client (real-time events)
Backend (server/src/) → Express routes → Services → Pipeline → Agents → Providers
Backend layers: Compiler API → Orchestrator → Assembly/Planning/Memory → Agents → LLM
```

### Cross-Boundary Violations

| Direction                                   | Count | Status   |
| ------------------------------------------- | ----- | -------- |
| Backend → Frontend (`../../src/`)           | 0     | ✅ CLEAN |
| Frontend → Backend (`../server/src/`)       | 0     | ✅ CLEAN |
| Backend → Browser runtime (react/react-dom) | 0     | ✅ CLEAN |
| Frontend → Node runtime (express/fs)        | 0     | ✅ CLEAN |

---

## 4. DRIFT ANALYSIS

### Dead Code (5 files still present)

| File                                           | Severity | Reason                                    |
| ---------------------------------------------- | -------- | ----------------------------------------- |
| `server/src/engine/GameGenerationEngine.ts`    | MEDIUM   | Redundant composition root (never used)   |
| `server/src/pipeline/PipelineRunner.ts`        | MEDIUM   | Superseded by aiPipelineIntegrator        |
| `server/src/execution/pipelineEngine.ts`       | LOW      | 3-line re-export shim                     |
| `server/src/execution/incrementalGenerator.ts` | LOW      | Never imported anywhere                   |
| `server/src/governance/orchestrator.ts`        | LOW      | Speculative interfaces, never implemented |

### Naming Inconsistencies

| Issue                                                                            | Severity |
| -------------------------------------------------------------------------------- | -------- |
| `governance/aiGovernance.ts` belongs in `validation/`                            | LOW      |
| `CompilerOrchestrator` (v1.0) partially overlaps with newer `CompilerAPI` (v1.1) | LOW      |

### Duplicates

| Issue                                                      | Status                                 |
| ---------------------------------------------------------- | -------------------------------------- |
| Root `agents/` directory                                   | ✅ REMOVED in v1.3.2                   |
| `server/src/llm/LLMProvider.ts` vs `server/src/providers/` | MEDIUM — llm/ is dead but still exists |

---

## 5. TOOLING ALIGNMENT

| Tool                       | Status    | Notes                                                |
| -------------------------- | --------- | ---------------------------------------------------- |
| **Vite**                   | ✅ OK     | Root `vite.config.ts` → builds `src/` correctly      |
| **TSConfig (frontend)**    | ✅ OK     | Root `tsconfig.json` → includes `src/` only          |
| **TSConfig (backend)**     | ✅ OK     | `server/tsconfig.json` → includes `server/src/` only |
| **ESLint**                 | ✅ OK     | `.eslintrc.json` enforces cross-boundary rules       |
| **Architecture Validator** | ✅ ACTIVE | `scripts/validate-architecture.ts` (pre-build gate)  |
| **Git Guard**              | ✅ ACTIVE | `scripts/git-boundary-guard.js` (pre-commit)         |
| **Build Scripts**          | ✅ OK     | `validate:arch → tsc → vite` pipeline                |

---

## 6. RUNTIME MODEL

| Runtime                 | Zone          | Entrypoint            | Process        |
| ----------------------- | ------------- | --------------------- | -------------- |
| Browser (Vite dev/prod) | `src/`        | `src/main.tsx`        | Client SPA     |
| Node.js (Express)       | `server/src/` | `server/src/index.ts` | Server process |

### Leaks Detected: **NO**

No browser APIs in backend. No Node APIs in frontend. Clean isolation.

---

## 7. AI SYSTEM SAFETY

| Check                                                                | Status                                         |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| Generator isolation (GenerationSandbox)                              | ✅ OK — validates target zone before write     |
| AI writes restricted to `server/src/` (backend) or `src/` (frontend) | ✅ Enforced                                    |
| Cross-boundary AI generation blocked                                 | ✅ Throws `GenerationError`                    |
| Plugin sandbox (Object.freeze + timeout)                             | ✅ OK — plugins cannot mutate core             |
| Multi-agent memory isolation                                         | ✅ OK — per-agent write, frozen shared context |

---

## 8. ARCHITECTURE SCORE

| Category                            | Score | Weight | Weighted |
| ----------------------------------- | ----- | ------ | -------- |
| Clarity (clear boundaries)          | 92    | 20%    | 18.4     |
| Isolation (no cross-boundary leaks) | 98    | 25%    | 24.5     |
| Tooling correctness                 | 95    | 15%    | 14.25    |
| Drift level (dead code, duplicates) | 78    | 15%    | 11.7     |
| Documentation completeness          | 82    | 10%    | 8.2      |
| AI safety                           | 95    | 15%    | 14.25    |

### **Overall Architecture Score: 91/100**

---

## 9. RECOMMENDED NEXT STEP

**Remove the 5 identified dead code files + `server/src/llm/` directory** (Phase 1 of ARCHITECTURE_REFACTOR_PLAN.md).

This is zero-risk (none are imported), eliminates all remaining drift, and brings the architecture score to ~96/100. Requires explicit approval per the plan.
