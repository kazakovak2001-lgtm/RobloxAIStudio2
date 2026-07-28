# Technical Audit v2.0 — Module Registry

**Audit date:** July 28, 2026  
**Backend baseline:** `a2f596dcb03d92791f96d1b217bf33a534eeddcb`  
**Frontend baseline:** `1036c3ef9705d145cb9700cd14268a33d2abdd58`

This registry describes the code that exists and how it is connected. “Exists” does not automatically mean “production-integrated.”

## Status vocabulary

| Status              | Meaning                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Active              | Constructed or called from a mounted production path.                                                                   |
| Active / partial    | Production-connected, but a documented behavior is stubbed, simulated, in-memory, or incomplete.                        |
| Supporting          | Used by an active module but not a standalone product surface.                                                          |
| Integration cluster | Tested or composed by `server/src/integration`, but that composition root is not bootstrapped by `server/src/index.ts`. |
| Isolated            | No production import from another backend subsystem was found.                                                          |
| Deprecated          | Explicitly replaced or excluded from runtime/package use.                                                               |

## Repository inventory

| Surface                | Inventory                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Backend repository     | 1,088 tracked files; 627 TypeScript/TSX; 335 Markdown; 14 Lua                             |
| Backend runtime source | 609 TypeScript files under `server/src`: 547 production files, 62 test files              |
| Backend subsystems     | 46 real top-level directories plus the `server/src/index.ts` composition root             |
| Backend HTTP API       | 30 unique mounted `/api` prefixes; `/api/projects` intentionally mounts two routers       |
| Backend tests          | 61 passing test files, 672 passing tests, one skipped test file/test on the audited run   |
| Standalone Frontend    | 133 tracked files; 99 tracked TypeScript/TSX; 97 TypeScript/TSX under `src`               |
| Frontend UI            | 80 TSX files, 63 files under `src/components`, 11 route modules including `__root.tsx`    |
| Frontend verification  | One native test file with seven passing cases; one 40-check production integration script |
| Studio plugin          | 14 Lua sources tracked; nine sources included in the canonical package; five excluded     |

## Backend subsystem registry

Counts exclude `*.test.ts`, `*.spec.ts`, and `__tests__` from the production column. Module-local test counts do not include the 27 cross-domain files in `server/src/__tests__`.

| Subsystem       | Production TS | Local tests | Status                     | Runtime role / audit disposition                                                                                                                                                                     |
| --------------- | ------------: | ----------: | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents`        |            32 |           1 | Active / partial           | Canonical 16-agent registry and `BaseAgent`; also contains collaboration and v2 orchestration implementations that overlap other stacks.                                                             |
| `ai`            |            33 |           6 | Active / partial           | Canonical provider contract/factory, prompt engine, context, memory, and agent runtime. Some subpackages are only used by alternate pipeline paths.                                                  |
| `analytics`     |             5 |           0 | Isolated                   | Separate production-quality analytics implementation with no production consumer; mounted analytics routes use `core/analytics`.                                                                     |
| `api`           |             8 |           0 | Active                     | Versioned v1/v2 routers and API gateway.                                                                                                                                                             |
| `artifacts`     |             2 |           0 | Active                     | Artifact registry/lineage support used by API, export, and routes.                                                                                                                                   |
| `assembly`      |            15 |           0 | Active / partial           | Assembly/compiler/governance support; includes future `.rbxl`/Rojo work.                                                                                                                             |
| `assets`        |             7 |           1 | Integration cluster        | Used only through `PlatformIntegrationManager`; active generation assets live under `generation/assets`.                                                                                             |
| `cloud`         |             6 |           0 | Supporting / partial       | Node and remote-worker abstractions; remote transport is still described as future work.                                                                                                             |
| `collaboration` |             7 |           0 | Isolated                   | Older collaboration/event-sourcing stack. The mounted route uses `agents/collaboration`, not this package.                                                                                           |
| `common`        |             3 |           0 | Active                     | Error and security middleware.                                                                                                                                                                       |
| `compiler`      |             8 |           0 | Active                     | Compiler API, project isolation, registry, telemetry, and execution guard.                                                                                                                           |
| `core`          |            24 |           1 | Active / partial           | Architecture, analytics, agent decisions, observability, consistency. Architecture enforcement has gaps documented in the gap report.                                                                |
| `distributed`   |            10 |           0 | Active / partial           | Mounted queue/coordinator/worker APIs; queues remain process-local.                                                                                                                                  |
| `domain`        |             6 |           0 | Active                     | Genre/pattern intelligence exposed through mounted routes.                                                                                                                                           |
| `economy`       |             5 |           0 | Active / partial           | Mounted analysis/simulation API; state and feedback paths are process-local.                                                                                                                         |
| `evaluation`    |             9 |           0 | Active                     | Agent evaluation and scoring used by `PlanExecutor` and routes.                                                                                                                                      |
| `eventsource`   |             4 |           0 | Isolated supporting        | Consumed by the isolated top-level collaboration stack, not the mounted collaboration route.                                                                                                         |
| `execution`     |             9 |           0 | Active + deprecated member | Execution guards/runners are consumed; `aiPipelineIntegrator.ts` is explicitly deprecated in favor of `PlanExecutor`.                                                                                |
| `export`        |             3 |           1 | Active                     | Export packaging and project output support.                                                                                                                                                         |
| `generation`    |            69 |           4 | Active / partial           | Largest domain: generation coordinator, assets, Lua, validation, export, and generation engine. Some outputs remain plans/placeholders rather than Roblox instances.                                 |
| `governance`    |             5 |           0 | Active                     | Policy and quality controls used by compiler/assembly.                                                                                                                                               |
| `integration`   |             4 |           1 | Isolated composition root  | Composes agents/orchestrator, providers/ai, assets, jobs, Lua, UI-gen, runtime, and knowledge memory, but is never started by `index.ts`.                                                            |
| `jobs`          |             9 |           1 | Integration cluster        | Scheduler/executor path reached through the unbootstrapped integration manager.                                                                                                                      |
| `knowledge`     |             8 |           0 | Active / partial           | Mounted patterns/prompts/search/store APIs and agent knowledge; no external/vector persistence.                                                                                                      |
| `lifecycle`     |             6 |           0 | Active / partial           | Mounted lifecycle operations; some feedback-to-planner integration is conceptual.                                                                                                                    |
| `lua`           |            16 |           1 | Integration cluster        | Separate Lua parser/generator/validator stack used by the unbootstrapped integration manager. Active product Lua paths also exist under `generation` and agent implementations.                      |
| `memory`        |            19 |           1 | Active / fragmented        | `MemoryEngine` and agent bridge are used by canonical planning and domain bridges; knowledge-memory is integration-cluster only, and most state is in memory.                                        |
| `orchestrator`  |             3 |           0 | Active / partial           | Mounted autonomous API. Its phase executor currently waits and returns simulated outputs instead of invoking named engines.                                                                          |
| `pipeline`      |            20 |           3 | Active alternate runtime   | Pipeline v2 is used by concept generation and Studio artifact storage. It coexists with canonical `PlanExecutor`.                                                                                    |
| `planning`      |            10 |           0 | Active                     | Planner, task graph, and canonical `PlanExecutor`. Declared parallel execution is not implemented.                                                                                                   |
| `platform`      |            34 |           1 | Active / partial           | Auth, storage, projects, users, versioning, registry, queues, teams, usage. Several secondary stores and RBAC remain unmounted or in memory.                                                         |
| `playtest`      |             4 |           0 | Active / partial           | Mounted runner/results and repair dependency; not a real Roblox runtime test harness.                                                                                                                |
| `plugins`       |             5 |           0 | Isolated                   | Backend extension-point/plugin framework with no production consumer; unrelated to the canonical Roblox Studio plugin.                                                                               |
| `projects`      |            17 |           0 | Active                     | Project/blueprint repositories, generation service, history, cache, and ownership boundary.                                                                                                          |
| `providers`     |            20 |           3 | Active / fragmented        | Top-level provider adapters are used by `LLMProviderFactory`; the nested `providers/ai` registry/adapters are used only by integration.                                                              |
| `repair`        |             5 |           0 | Active / partial           | Mounted repair APIs and playtest integration; repair mutation and re-playtest behavior is simulated.                                                                                                 |
| `routes`        |            29 |           2 | Active                     | Main HTTP adapters. Several routers own process-local maps.                                                                                                                                          |
| `runtime`       |             7 |           0 | Integration cluster        | Runtime controller/error/policy support is reached through jobs/integration, not the server composition root.                                                                                        |
| `services`      |             1 |           0 | Supporting                 | Shared diagnosis service used by a mounted route.                                                                                                                                                    |
| `simulation`    |             5 |           0 | Active / partial           | Mounted simulation and feedback; result storage is process-local.                                                                                                                                    |
| `socket`        |             2 |           0 | Active                     | Socket.IO project rooms and pipeline event streaming.                                                                                                                                                |
| `studio`        |            33 |           6 | Active                     | Shared Studio runtime, durable artifact bridge, command ledger, sync, exact receipt verification, import/export mapping. Some older/import-direction classes are not on the canonical outbound path. |
| `types`         |             5 |           0 | Supporting                 | Shared backend contracts.                                                                                                                                                                            |
| `ui-gen`        |             7 |           1 | Integration cluster        | Separate UI generation stack reached only through integration; active UI agent output also exists elsewhere.                                                                                         |
| `validation`    |             1 |           1 | Isolated                   | Standalone validator with no production consumer.                                                                                                                                                    |
| `world`         |             6 |           0 | Active / partial           | Mounted world API and artifact support; persistent single-tick world state is not implemented.                                                                                                       |

### Composition root

`server/src/index.ts` imports 11 top-level subsystems directly and mounts 30 unique `/api` prefixes. It constructs:

- one configured storage provider and shared auth/API-key boundary;
- the canonical `LLMProviderFactory` and `AgentRegistry`;
- the primary `GameGenerationService`;
- the shared `StudioIntegrationManager`;
- Socket.IO, realtime project rooms, tracing, and pipeline event bridges;
- the distributed execution coordinator.

It does not construct `PlatformIntegrationManager`, the top-level collaboration package, the backend plugin framework, or the separate `providers/ai` registry.

## Canonical and overlapping runtime paths

| Concern                      | Canonical/active path                                                              | Other existing path                                                                                                                    | Disposition                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary generation execution | `planning/execution/PlanExecutor.ts` via `GameGenerationService`                   | `pipeline/v2/PipelineEngine`, `orchestrator/AutonomousOrchestrator`, `runtime/controller`, deprecated `execution/aiPipelineIntegrator` | Keep Pipeline v2 only where its artifact/review semantics are required; connect or retire the simulated autonomous path; preserve deprecated file only until consumers/types are removed. |
| Agent registry               | `agents/core/AgentRegistry.ts`                                                     | `ai/agents/AgentRegistry.ts`, `agents/orchestrator`, top-level `collaboration`                                                         | Document ownership and prevent another composition root.                                                                                                                                  |
| Provider selection           | `ai/providerFactory.ts` + top-level `providers/*.ts`                               | `providers/ai/*` registry/adapters                                                                                                     | Integration-only stack must be adopted intentionally or retired.                                                                                                                          |
| Prompt management            | `ai/prompts/PromptEngine.ts` through `BaseAgent`                                   | Legacy prompt template registry/fallback                                                                                               | Keep the versioned PromptEngine authoritative; time-box the legacy fallback.                                                                                                              |
| Memory                       | `memory/core/MemoryEngine` + `AgentMemoryBridge` for `PlanExecutor`                | `ai/memory`, `memory/knowledge`, route-local/process-local stores                                                                      | Define one durable memory contract and migration boundary.                                                                                                                                |
| Collaboration                | `agents/collaboration` through `/api/agents`                                       | top-level `collaboration`, `agents/orchestrator`                                                                                       | Mounted implementation is partial; isolated stacks require disposition.                                                                                                                   |
| Studio delivery              | `studio/v2` + shared `StudioIntegrationManager` + canonical plugin command polling | older Studio importer/sync abstractions                                                                                                | Preserve the verified outbound command path; mark import-direction/experimental classes explicitly.                                                                                       |

## Standalone Frontend registry

| Area                   |                Files | Status               | Notes                                                                                                                                           |
| ---------------------- | -------------------: | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components`       |            63 TS/TSX | Active               | Workspace, agents, auth/layout UI, and reusable Radix-derived components.                                                                       |
| `src/routes`           | 11 TSX route modules | Active               | Root, auth, dashboard, projects, agents, settings, and project workspace.                                                                       |
| `src/services`         |                 3 TS | Active / partial     | One REST adapter, one Socket.IO adapter, one Workspace read model. No duplicate transport exists, but contract types are manually duplicated.   |
| `src/hooks`            |                 4 TS | Active               | Auth/project/realtime/workspace behavior.                                                                                                       |
| `src/contexts`         |                3 TSX | Active               | Auth, project, and application state.                                                                                                           |
| `src/layouts`          |                2 TSX | Active               | Public and authenticated layouts.                                                                                                               |
| Native tests           |     1 file / 7 cases | Partial              | Covers Workspace decision logic, not route rendering, auth mutations, realtime recovery, or service parsing.                                    |
| Production integration |            40 checks | Passing, unprotected | Covers auth, cross-user REST/realtime isolation, modules, generation, and guarded Studio sync when the backend runs with `NODE_ENV=production`. |

### Frontend contract gap

The backend returns `artifactVerified`, `verificationStatus`, execution identity, artifact count, and verification error from the project Studio status endpoint. `workspaceReadModel.ts` currently narrows `studioArtifactVerified` to the literal `false` and assigns it unconditionally, so the canonical Frontend cannot represent a successful verified import even though the backend and plugin can.

## Studio plugin registry

### Canonical packaged sources (9)

| Source                               | Responsibility                                        |
| ------------------------------------ | ----------------------------------------------------- |
| `plugin.lua`                         | Plugin entrypoint and lifecycle                       |
| `src/core/Config.lua`                | Version, protocol, backend URL, polling configuration |
| `src/core/Events.lua`                | Local plugin event bus                                |
| `src/services/ConnectionManager.lua` | Connection, project identity, heartbeat, reconnect    |
| `src/services/StudioConnector.lua`   | HTTP protocol and command ledger adapter              |
| `src/services/SyncManager.lua`       | Poll, acknowledge, materialize, report exact receipts |
| `src/ui/CommandPanel.lua`            | Dock widget and operator state                        |
| `src/utils/ArtifactLoader.lua`       | Lua hierarchy creation and metadata materialization   |
| `src/utils/ErrorReporter.lua`        | Error capture and presentation                        |

### Excluded sources (5)

| Source                                      | Classification                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `src/services/ConnectionManager_legacy.lua` | Deprecated migration inventory                                             |
| `src/services/SyncManager_legacy.lua`       | Deprecated migration inventory                                             |
| `src/ui/UI_legacy.lua`                      | Deprecated migration inventory                                             |
| `src/legacy/ApiClient.lua`                  | Deprecated migration inventory; naming/docs should make exclusion explicit |
| `src/utils/RuntimeValidator.lua`            | Deferred experimental validator; contract tests explicitly exclude it      |

The package allowlist is deterministic and tests prove that legacy/validator content does not enter the `.rbxmx`.

## Architecture manifest coverage

The current manifest declares 32 domain entries, including stale `engine`, while 46 real subsystem directories exist. These 15 real directories are not modeled:

`analytics`, `assets`, `compiler`, `domain`, `integration`, `jobs`, `knowledge`, `lua`, `orchestrator`, `platform`, `playtest`, `repair`, `runtime`, `services`, `ui-gen`.

The detailed enforcement consequences are in [ARCHITECTURE_GAP_REPORT.md](./ARCHITECTURE_GAP_REPORT.md).
