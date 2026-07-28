# Technical Audit v2.0 Refresh — Module Registry

**Backend baseline:** `2ecb3997eb6fab5074c438f10dedcc1715381e11`  
**Frontend baseline:** `739b43cbc5f991c1852e80b30fe38c0e7c02d681`

## Status vocabulary

- **Complete:** production-connected and representative verification exists.
- **Operational:** core path works; bounded hardening remains.
- **Partial:** meaningful implementation exists, but a material contract is missing.
- **Prototype:** mounted or tested, but simulated, isolated, process-local, or substantially incomplete.
- **Isolated:** code exists without a production composition-root consumer.
- **Deprecated:** explicitly superseded or blocked from new use.

## Repository inventory

| Surface | Verified inventory / disposition |
|---|---|
| Backend repository | Independent Node.js/TypeScript backend; protected default `release/cutover-1e-candidate` |
| Frontend repository | Independent React 19/TanStack/Vite application; protected production contract |
| Backend runtime | Express, Socket.IO, PostgreSQL provider, generation, Studio runtime, validation, analytics and domain APIs |
| Frontend runtime | SSR application, authenticated Workspace, REST and realtime adapters |
| Studio plugin | Deterministic `.rbxmx` package with allowlisted active Lua sources |
| API surface | Approximately 30 mounted `/api` prefixes plus root and health endpoints |
| Backend verification | 61 passing test files and 672 passing tests at original audit baseline; protected release and contract gates remain active |
| Frontend verification | Native Workspace tests, production build/SSR/responsive gates, exact 40-check backend contract |

## Backend subsystem registry

| Subsystem | Status | Production role | Audit disposition |
|---|---|---|---|
| `agents` | Operational | Canonical agent registry, BaseAgent, collaboration helpers | Preserve canonical registry; classify overlapping agent/orchestrator stacks |
| `ai` | Operational | Provider factory, PromptEngine, ContextManager, memory helpers | Canonical AI boundary; retire or constrain alternate implementations |
| `analytics` | Isolated/partial | Additional analytics implementation | Consolidate with mounted `core/analytics` |
| `api` | Complete core | Versioned routers and gateway | Keep as transport boundary |
| `artifacts` | Complete core | Artifact registry and lineage | Preserve as shared contract |
| `assembly` | Partial | Assembly/compiler/governance support | Future `.rbxl`/Rojo claims require explicit scope |
| `assets` | Isolated cluster | Alternate asset pipeline | Adopt intentionally or retire |
| `cloud` | Prototype | Remote worker abstractions | No production remote transport proof |
| `collaboration` | Isolated | Older event-sourced collaboration stack | Do not expand before F-12 re-evaluation |
| `common` | Complete core | Error and security middleware | Preserve |
| `compiler` | Operational | Compiler API, isolation, registry and guards | Keep; align architecture ownership |
| `core` | Partial | Architecture, analytics, observability, consistency | Architecture validator is current P0 gap |
| `distributed` | Partial | Queue/coordinator/worker APIs | Process-local queues require classification |
| `domain` | Operational | Genre/pattern intelligence | Mounted and usable |
| `economy` | Partial | Economy analysis/simulation | Persist or clearly label preview state |
| `evaluation` | Operational | Agent scoring/evaluation | Canonical PlanExecutor dependency |
| `eventsource` | Isolated support | Supports isolated collaboration stack | Retire or bound with collaboration decision |
| `execution` | Operational + deprecated member | Guards/runners; deprecated integrator | Remove deprecated path after migrations |
| `export` | Operational | Packaging and project output | Keep; distinguish package export from Place publication |
| `generation` | Operational | Main generation, Lua, validation and artifacts | Canonical product generation surface |
| `governance` | Operational | Policy and quality controls | Keep; resolve assembly cycle |
| `integration` | Isolated composition root | Builds alternate platform stack | Must not remain silently disconnected |
| `jobs` | Isolated cluster | Scheduler/executor path | Adopt through one composition root or retire |
| `knowledge` | Partial | Patterns, prompts, search and knowledge store | External/durable retrieval not complete |
| `lifecycle` | Partial | Lifecycle APIs and feedback | Feedback loop not fully connected |
| `lua` | Isolated cluster | Alternate Lua parser/generator/validator | Consolidate with active generation/agent Lua paths |
| `memory` | Partial/fragmented | MemoryEngine and AgentMemoryBridge | Select one durable canonical memory model |
| `orchestrator` | Prototype | Mounted autonomous lifecycle | Timed/simulated phase work remains |
| `pipeline` | Partial | Pipeline v2 concept/review/artifact semantics | Bound responsibility against PlanExecutor |
| `planning` | Operational | Planner, DAG and canonical PlanExecutor | Parallel option and recovery remain gaps |
| `platform` | Operational/partial | Auth, storage, projects, users, queues, teams, usage | RBAC and several secondary stores remain incomplete |
| `playtest` | Prototype | Playtest API and repair input | Not a real Roblox runtime harness |
| `plugins` | Isolated | Backend extension framework | Not production plugin SDK |
| `projects` | Complete core | Projects, blueprints, generation history and ownership | Preserve as tenant boundary |
| `providers` | Partial/fragmented | Active provider adapters plus alternate registry | Consolidate behind one provider interface |
| `repair` | Prototype | Repair API and playtest integration | Mutation/re-playtest behavior simulated |
| `routes` | Operational | Main HTTP adapters | Remove or classify route-local Maps |
| `runtime` | Isolated cluster | Alternate runtime controller | Adopt intentionally or retire |
| `services` | Supporting | Shared diagnosis service | Keep |
| `simulation` | Partial | Simulation and feedback | Process-local results |
| `socket` | Complete core | Project rooms and pipeline events | Preserve authenticated contract |
| `studio` | Complete core / partial scope | Artifact bridge, command ledger, ACK/result verification | Core complete; native asset/GUI/place scope separate |
| `types` | Supporting | Shared backend contracts | Move cross-repository contracts toward generated/schema validation |
| `ui-gen` | Isolated cluster | Alternate UI generator | Consolidate with active UI-agent output |
| `validation` | Isolated | Standalone validator | Adopt or retire; active validation exists elsewhere |
| `world` | Partial | World API and artifact support | Persistent world state incomplete |

## Canonical runtime ownership

| Concern | Canonical path | Competing path | Required action |
|---|---|---|---|
| Generation execution | `PlanExecutor` through `GameGenerationService` | Pipeline v2, autonomous orchestrator, runtime controller | Publish bounded ownership matrix |
| Providers | `ai/providerFactory.ts` plus top-level providers | `providers/ai` | Consolidate |
| Prompts | Versioned `PromptEngine` | Legacy template fallback | Time-box fallback |
| Context | `ContextManager` | Ad-hoc contexts | Enforce one contract |
| Memory | `memory/core` + bridge | `ai/memory`, knowledge memory, local Maps | Define durable canonical model |
| Collaboration | `agents/collaboration` | top-level collaboration and alternate orchestrators | Defer expansion; disposition stacks |
| Studio delivery | `studio/v2` shared runtime and canonical plugin | older/import-direction abstractions | Preserve verified outbound path |

## Frontend registry

| Area | Status | Notes |
|---|---|---|
| Routes/layouts | Operational | Authenticated dashboard/projects/agents/settings/workspace |
| Components | Operational | Workspace and Radix-derived UI surface |
| REST adapter | Operational | Cookie-based production API contract |
| Socket adapter | Operational | Authenticated project realtime |
| Workspace read model | Operational | Real Studio verification fixed in FE-201 |
| Native tests | Partial | Expand route, auth mutation and recovery coverage |
| Production contract | Complete core | Exact 40-check suite protected in both repos |
| Lint/format | Partial | FRONTEND-2C gate remains |
| Bundle performance | Partial | Direct icon imports and budgets remain |

## Roblox Studio registry

| Capability | Status | Evidence / gap |
|---|---|---|
| Plugin package | Complete | Deterministic allowlist and checksums |
| Connection/session | Complete core | Project-scoped connection and reconnect |
| Command delivery | Complete | Poll, ACK, result and exact receipt ordering |
| Lua hierarchy | Complete core | Script, LocalScript and ModuleScript materialization |
| Metadata hierarchy | Operational | Non-Lua metadata represented as StringValues |
| Exact verification | Complete | Execution, artifact IDs and SHA-256 hashes verified |
| Native assets | Prototype | No real model/mesh/audio/image insertion |
| Generated native GUI | Prototype | No direct ScreenGui/control construction |
| Runtime validation | Deferred | RuntimeValidator excluded from canonical package |
| Place publication | Missing/prototype | No canonical `.rbxl` or place deployment |
