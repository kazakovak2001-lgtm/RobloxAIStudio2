# Frontend ↔ Backend Integration Audit

**Date**: July 15, 2026  
**Type**: Analysis Only — No Code Changes  
**Purpose**: Complete reality map of frontend-backend connections

---

## Executive Summary

| Metric                                  | Count                   |
| --------------------------------------- | ----------------------- |
| Frontend pages                          | 11                      |
| Frontend services (API clients)         | 10                      |
| Backend API route groups                | 30                      |
| Fully connected features                | 4                       |
| Partially connected                     | 2                       |
| Demo-only (frontend fake, backend real) | 3                       |
| Backend without any frontend            | 15                      |
| Frontend integration coverage           | 50% (15/30 routes used) |

**Primary gap**: 15 backend subsystems have fully implemented APIs but zero frontend exposure.

---

## Frontend Inventory

### Pages → Backend Connection

| Page              | Route           | Services Used                                                                      | Backend Endpoints Hit                                              | Status                  |
| ----------------- | --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| LandingPage       | /               | None                                                                               | None                                                               | ✅ STATIC (intentional) |
| LoginPage         | /login          | AuthContext (placeholder)                                                          | None (local state)                                                 | ⚠️ PLACEHOLDER AUTH     |
| RegisterPage      | /register       | AuthContext (placeholder)                                                          | None (local state)                                                 | ⚠️ PLACEHOLDER AUTH     |
| DashboardPage     | /dashboard      | projectService, aiEngine, systemApi                                                | /api/projects, /health, /api/system/status, /api/system/agents     | ✅ CONNECTED            |
| ProjectsPage      | /projects       | projectService                                                                     | /api/projects (CRUD)                                               | ✅ CONNECTED            |
| NewProjectPage    | /new-project    | projectService, conceptApi                                                         | /api/projects, /api/concept/generate                               | ✅ CONNECTED            |
| WorkspacePage     | /projects/:id   | aiEngine, conceptApi, generationMonitorApi, studioBridgeApi, studioService, socket | /api/concept/experience/_, /api/studio/_, /api/system/*, WebSocket | ✅ FULLY CONNECTED      |
| AiStudioPage      | /ai-engine      | None (hardcoded agents, setTimeout)                                                | None                                                               | ❌ DEMO ONLY            |
| PluginManagerPage | /plugin-manager | None (hardcoded data, simulated sync)                                              | None                                                               | ❌ DEMO ONLY            |
| AnalyticsPage     | /analytics      | None (hardcoded metrics)                                                           | None                                                               | ❌ DEMO ONLY            |
| SettingsPage      | /settings       | None (static layout)                                                               | None                                                               | ❌ PLACEHOLDER          |

### Frontend Services → Backend Routes

| Service              | File                    | Endpoints Called                                                                     | Used By                                |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| aiEngine             | aiEngine.ts             | /api/concept/experience/generate-direct, /api/concept/experience/status/:id, /health | Workspace, Dashboard, AiEngineDemoPage |
| conceptApi           | conceptApi.ts           | /api/concept/generate, /api/concept/experience/* (15+ endpoints)                     | NewProjectPage, Workspace              |
| projectService       | projectService.ts       | /api/projects (CRUD), /api/projects/:id/history                                      | Dashboard, Projects, NewProject        |
| systemApi            | systemApi.ts            | /api/system/status, /api/system/agents, /api/system/agents/:id                       | Dashboard                              |
| studioBridgeApi      | studioBridgeApi.ts      | /api/studio/* (status, connect, disconnect, heartbeat, protocol/_, sync/_)           | Workspace                              |
| studioService        | studioService.ts        | /api/v1/studio/status, /api/v1/studio/sync                                           | Workspace                              |
| gameArchitectApi     | gameArchitectApi.ts     | /api/ai/game-architect/analyze, /api/ai/game-architect/generate-prompts              | Workspace (GameArchitectPanel)         |
| generationMonitorApi | generationMonitorApi.ts | /api/concept/experience/:id/metrics, /api/concept/experience/:id/audit               | Workspace                              |
| socket               | socket.ts               | WebSocket (localhost:5000)                                                           | Workspace (usePipelineStream)          |
| api                  | api.ts                  | Generic fetch wrapper                                                                | Utility (not used directly by pages)   |

### WebSocket Events (Used by Frontend)

| Event Category     | Events                                                | Used By                       |
| ------------------ | ----------------------------------------------------- | ----------------------------- |
| Pipeline lifecycle | pipeline.started, pipeline.completed, pipeline.failed | usePipelineStream → Workspace |
| Step lifecycle     | step.started, step.completed, step.failed             | usePipelineStream → Workspace |
| Generation         | generation.started, generation.completed              | Workspace                     |

---

## Backend Capability Inventory

### Fully Used by Frontend

| Subsystem          | Route                  | Frontend Service    | Status                                                                             |
| ------------------ | ---------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Projects           | /api/projects          | projectService.ts   | ✅ Full CRUD                                                                       |
| Concept/Experience | /api/concept           | conceptApi.ts       | ✅ Full lifecycle (generate, status, artifacts, review, pause/resume/cancel/retry) |
| System Status      | /api/system            | systemApi.ts        | ✅ Status + agent listing                                                          |
| Studio Bridge      | /api/studio            | studioBridgeApi.ts  | ✅ Connect/disconnect/heartbeat/sync/protocol                                      |
| Game Architect     | /api/ai/game-architect | gameArchitectApi.ts | ✅ Analyze + generate prompts                                                      |
| Health             | /health                | aiEngine.ts         | ✅ Provider detection                                                              |

### Partially Used

| Subsystem     | Route            | What's Used                        | What's NOT Used                                     |
| ------------- | ---------------- | ---------------------------------- | --------------------------------------------------- |
| Generation v2 | /api/generate    | Indirectly via concept pipeline    | Direct generation endpoint not called from frontend |
| V1/V2 Gateway | /api/v1, /api/v2 | /api/v1/studio/* via studioService | Most v1/v2 endpoints unused                         |

### NOT Used by Frontend (Backend Ready, No Frontend)

| Subsystem   | Route            | Backend Module          | Capability                                          |
| ----------- | ---------------- | ----------------------- | --------------------------------------------------- |
| Analytics   | /api/analytics   | analytics/              | Usage metrics, cost tracking, generation statistics |
| Simulation  | /api/simulate    | simulation/             | Game simulation, gameplay testing                   |
| Economy     | /api/economy     | economy/                | In-game economy modeling, balance simulation        |
| World       | /api/world       | world/                  | World generation, NPC behavior, emergence           |
| Lifecycle   | /api/lifecycle   | lifecycle/              | Project lifecycle, evolution, patching              |
| Compile     | /api/compile     | compiler/               | Lua compilation, assembly                           |
| Debug       | /api/debug       | debug/                  | Debug utilities                                     |
| Evaluation  | /api/evaluation  | evaluation/             | Quality evaluation, regression detection            |
| Memory      | /api/memory      | memory/                 | Agent memory, knowledge persistence                 |
| Planning    | /api/plan        | planning/               | Dynamic plan generation/execution                   |
| Distributed | /api/distributed | distributed/            | Worker management, cloud execution                  |
| Playtest    | /api/playtest    | playtest/               | Automated playtesting                               |
| Repair      | /api/repair      | repair/                 | Self-healing, error recovery                        |
| Knowledge   | /api/knowledge   | knowledge/              | Knowledge base management                           |
| Agents      | /api/agents      | agents/collaboration/   | Multi-agent coordination                            |
| Domain      | /api/domain      | domain/                 | Domain intelligence                                 |
| Autonomous  | /api/autonomous  | autonomous orchestrator | Hands-off pipeline execution                        |
| Lua Gen     | /api/lua         | lua/                    | Direct Lua code generation                          |
| Platform    | /api/platform    | platform/               | Users, teams, auth, registry, versioning            |

---

## Integration Gaps (Priority Order)

### Gap 1: Demo Pages with Ready Backend (HIGHEST PRIORITY)

| Page              | What's Fake                   | Backend Ready                            | Effort                        |
| ----------------- | ----------------------------- | ---------------------------------------- | ----------------------------- |
| AnalyticsPage     | All metrics hardcoded         | /api/analytics ✅                        | LOW — pure data fetch         |
| AiStudioPage      | Chat responses are setTimeout | /api/lua ✅, /api/generate ✅            | MEDIUM — streaming            |
| PluginManagerPage | Connection/sync simulated     | /api/studio ✅ (studioBridgeApi exists!) | LOW — service already written |

### Gap 2: Authentication (Placeholder)

| Component            | Current State                    | Backend Ready                         |
| -------------------- | -------------------------------- | ------------------------------------- |
| AuthContext          | Local state, fake login/register | /api/platform (auth, users) — PARTIAL |
| Login/Register pages | Working UI but no real auth      | OAuth2/JWT not implemented in backend |

### Gap 3: Settings Page (No Functionality)

| Page         | Current State                 | Backend Support           |
| ------------ | ----------------------------- | ------------------------- |
| SettingsPage | Static cards, no interactions | No dedicated settings API |

---

## Duplicate / Risk Areas

| Area                             | Risk   | Details                                                                                                                                                                     |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio Bridge duplication        | LOW    | Two services exist (studioBridgeApi.ts + studioService.ts). studioService uses /api/v1, studioBridgeApi uses /api/studio. Both work. Consolidation possible but not urgent. |
| AiEngineDemoPage vs AiStudioPage | MEDIUM | Two AI pages exist. AiEngineDemoPage calls real pipeline; AiStudioPage is demo chat. Should merge or differentiate purpose.                                                 |
| Auth placeholder                 | HIGH   | AuthContext simulates auth with setTimeout. Any feature requiring real auth will be blocked until /api/platform auth is connected.                                          |

---

## Recommended Implementation Order

Based on: backend readiness, frontend effort, risk, and business value.

| Priority | Task                                               | Effort     | Reason                                                              |
| -------- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| 1        | F-3: Wire PluginManagerPage to studioBridgeApi     | 0.5 sprint | Service ALREADY EXISTS. Just replace hardcoded data with API calls. |
| 2        | F-1: Wire AnalyticsPage to /api/analytics          | 1 sprint   | Backend ready. Need new analyticsApi.ts service + chart library.    |
| 3        | F-2: Wire AiStudioPage to /api/lua + /api/generate | 1 sprint   | Replace setTimeout with real AI backend. Streaming complexity.      |
| 4        | UX-4.1: Responsive Layout Fix                      | 1 sprint   | Bug affecting all viewports <1024px. Spec ready.                    |
| 5        | F-4: Game Simulation panel                         | 2 sprints  | New feature, backend ready.                                         |

---

## Next Recommended Task

**F-3: Wire PluginManagerPage to studioBridgeApi** — The frontend service `src/services/studioBridgeApi.ts` already has all the API calls implemented. The PluginManagerPage just needs to import and use them instead of hardcoded local state. This is the lowest-effort, highest-confidence task available.

Alternatively: **F-1 (Analytics)** if business visibility of metrics is prioritized over plugin functionality.
