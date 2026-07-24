# Current Project State

**Last Updated**: July 24, 2026
**Phase**: WORKSPACE-1 — Workflow-Oriented Standalone Workspace Audit and Design
**Build Status**: Backend CI is green on Node.js 22 / npm 10, including the full test suite and real PostgreSQL restart acceptance; standalone frontend typecheck and production build pass

---

## Architecture

### Backend

- **Server**: Express + Socket.io (Node.js/TypeScript)
- **Files**: 573 TypeScript files in 48 subsystems
- **API Routes**: 28 registered endpoint groups (+ health, root)
- **AI Providers**: 7 (OpenAI, Anthropic, Gemini, Groq, Ollama, OpenRouter, Mock)
- **Storage**: One configured provider per process; PostgreSQL migrations and cache hydration complete before the server listens. `STORAGE_PROVIDER=postgres` requires `DATABASE_URL`.
- **Durable records**: identities, sessions, users, projects, generation history, API keys, blueprints, blueprint versions, generation executions, conversations, and conversation messages use the configured storage boundary.
- **Real-time**: Socket.io with 50+ event types, project rooms, JWT-authenticated handshake (production)
- **Authentication**: bcrypt password hashing (cost 12), storage-backed sessions/roles, cryptographic validation, httpOnly cookie delivery

### Canonical Frontend

- **Repository**: [kazakovak2001-lgtm/Frontend](https://github.com/kazakovak2001-lgtm/Frontend) on `main`
- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS
- **Routing and state**: TanStack Router/Query, typed backend adapter, Socket.IO realtime client
- **Ownership**: All new user-facing web functionality belongs in the standalone repository.
- **Current Workspace**: `/projects/$projectId` already contains overview, modules, manifest, chat, agents, live logs, settings, and export surfaces. WORKSPACE-1 will reorganize and connect these existing surfaces rather than create a parallel Workspace.

### Legacy Frontend

- **Location**: repository root `src/`
- **Status**: Frozen migration inventory; no new product features, pages, or parallel integrations.
- **Removal**: Allowed only after the gates in [FRONTEND_CUTOVER.md](./FRONTEND_CUTOVER.md) pass.

### Health Scores

- Architecture Health: 9.2/10
- Design System Compliance: 95%
- Engineering Handbook Compliance: 88%
- Import Strategy: 100%
- Technical Debt: 2 remaining items (96% resolved from baseline of 47)

---

## Completed Phases

| Phase            | Description                                       | Date          |
| ---------------- | ------------------------------------------------- | ------------- |
| UX-3             | Initial Implementation                            | July 2026     |
| UX-3A            | Forensic Audit                                    | July 2026     |
| UX-3B            | Architecture Stabilization Planning               | July 2026     |
| UX-3C            | Execution Planning                                | July 2026     |
| UX-3D Sprint 1   | Duplicate Consolidation                           | July 15, 2026 |
| UX-3D Sprint 2   | shared/ui Migration                               | July 15, 2026 |
| UX-3D Sprint 3   | Repository Structure Execution                    | July 15, 2026 |
| UX-3D Sprint 4   | Import & Path Alias Migration                     | July 15, 2026 |
| UX-3D Sprint 5   | Legacy Cleanup                                    | July 15, 2026 |
| UX-3D Sprint 6   | Design System Enforcement                         | July 15, 2026 |
| UX-3D Sprint 7   | Documentation Synchronization                     | July 15, 2026 |
| UX-3D Sprint 8   | Final Validation & Closure                        | July 15, 2026 |
| UX-4 Preparation | Development Readiness                             | July 15, 2026 |
| UX-4.0           | Product Roadmap Definition                        | July 15, 2026 |
| UX-4 Phase 1     | Must Have Features (F-1, F-2, F-3)                | July 15, 2026 |
| UX-4 Phase 2A    | Should Have Features (F-4 to F-8)                 | July 15, 2026 |
| UX-4 Phase 2B    | Infrastructure (F-9, F-10, F-11)                  | July 15, 2026 |
| CUTOVER-0        | Standalone frontend governance                    | July 24, 2026 |
| CI-BASELINE-1    | Portable CI and repository hygiene                | July 24, 2026 |
| CORE-1a          | Durable identity, projects, and ownership         | July 24, 2026 |
| CORE-1b          | Durable blueprints, executions, chat, restart E2E | July 24, 2026 |

---

## Historical Feature Completion Status

> The table below records the UX-4 delivery history for the embedded frontend. It is not the source of truth for new standalone frontend work. See [FRONTEND_CUTOVER.md](./FRONTEND_CUTOVER.md).

| ID   | Feature                  | Status       | Details                                              |
| ---- | ------------------------ | ------------ | ---------------------------------------------------- |
| F-1  | Analytics Real Data      | ✅ Connected | analyticsApi → /api/analytics (7 endpoints)          |
| F-2  | AI Studio Chat Backend   | ✅ Connected | aiEngine → /api/lua, /api/concept (real Lua gen)     |
| F-3  | Plugin Manager Real Data | ✅ Connected | PluginManagerPage → /api/platform (real API data)    |
| F-4  | Game Simulation          | ✅ Connected | simulationApi → /api/simulate (workspace panel)      |
| F-5  | Economy Designer         | ✅ Connected | economyApi → /api/economy (workspace panel)          |
| F-6  | Autonomous Pipeline      | ✅ Connected | autonomousApi → /api/autonomous (5 API fns, polling) |
| F-7  | Knowledge Base UI        | ✅ Connected | knowledgeApi → /api/knowledge (page + 4 endpoints)   |
| F-8  | Playtesting Dashboard    | ✅ Connected | playtestApi → /api/playtest (workspace panel)        |
| F-9  | Multi-Project Workspace  | ✅ Complete  | SaaSProjectRepository + ownership + auth headers     |
| F-10 | Real Authentication      | ✅ Complete  | bcrypt, JWT validation, httpOnly cookies             |
| F-11 | Persistent Storage       | ✅ Complete  | PostgreSQL with InMemory fallback                    |

---

## Security Hardening Status (Release Sprint)

| Task | Description                                    | Status      |
| ---- | ---------------------------------------------- | ----------- |
| 1    | Bug condition exploration tests                | ✅ Complete |
| 2    | Preservation property tests                    | ✅ Complete |
| 3    | Auth route PUBLIC_PREFIXES fix                 | ✅ Complete |
| 4    | bcrypt password hashing (replaces SHA-256)     | ✅ Complete |
| 5    | httpOnly cookie token delivery                 | ✅ Complete |
| 6    | JWT cryptographic validation in authMiddleware | ✅ Complete |
| 7    | Socket.IO JWT handshake validation             | ✅ Complete |
| 8    | Dead code removal                              | ✅ Complete |
| 9    | Documentation synchronization                  | ✅ Complete |
| 10   | Production infrastructure                      | ✅ Complete |
| 11   | Final verification & release report            | ✅ Complete |
| 12   | Checkpoint — all tests pass                    | ✅ Complete |

---

## Historical Backend Capabilities — Legacy Frontend Connection Status

> The mapping below describes the embedded frontend. The standalone frontend mapping is governed by the CUTOVER delivery sequence.

| Backend System | Route            | Frontend Status                                      |
| -------------- | ---------------- | ---------------------------------------------------- |
| Analytics      | /api/analytics   | ✅ Connected (analyticsApi, AnalyticsPage)           |
| AI Studio      | /api/lua         | ✅ Connected (aiEngine, AiStudioPage)                |
| Simulation     | /api/simulate    | ✅ Connected (SimulationPanel in Workspace)          |
| Economy        | /api/economy     | ✅ Connected (EconomyPanel in Workspace)             |
| Playtest       | /api/playtest    | ✅ Connected (PlaytestPanel in Workspace)            |
| Knowledge      | /api/knowledge   | ✅ Connected (KnowledgePage at /knowledge)           |
| Autonomous     | /api/autonomous  | ✅ Connected (AutonomousPipelinePanel)               |
| Platform       | /api/platform    | ✅ Connected (Auth login/register/logout/refresh/me) |
| Plugin Mgr     | /api/platform    | ✅ Connected (PluginManagerPage)                     |
| Studio Bridge  | /api/studio      | ✅ Connected (studioBridgeApi)                       |
| World Gen      | /api/world       | No frontend page                                     |
| Repair         | /api/repair      | No frontend page                                     |
| Domain         | /api/domain      | No frontend page                                     |
| Agent Collab   | /api/agents      | No frontend page                                     |
| Distributed    | /api/distributed | No frontend page                                     |
| Lifecycle      | /api/lifecycle   | No frontend page                                     |
| Compile        | /api/compile     | No frontend page                                     |

---

## Known Problems

1. **ESLint Config**: v10 installed with legacy `.eslintrc.json` format (functional but deprecated config style).
2. **Workspace information architecture**: the canonical project route exposes eight tabs and `WorkspaceModules` exposes many backend domains as an undifferentiated module grid. The data is connected, but the workflow is fragmented and operational priority is unclear.
3. **Workspace data presentation**: several module actions render raw JSON payloads instead of stable, task-oriented views; loading, refresh, history, and failure recovery are repeated inside one large component.
4. **Studio artifact fidelity**: Studio synchronization must be validated against real generated artifact packages during STUDIO-1, not temporary or fallback payloads.

---

## Technical Debt (2 items)

1. **Minimal frontend test coverage** (MEDIUM) — Foundation established. Expand coverage incrementally around the canonical Workspace route and backend adapter.
2. **Missing JSDoc** (MEDIUM) — Components and services lack JSDoc documentation.

---

## Development Process

All implementation work must follow: `docs/templates/IMPLEMENTATION_TASK_TEMPLATE.md`

This template enforces:

- Pre-implementation verification (reuse before create)
- Consistent validation (TypeScript + Vite + Tests)
- Mandatory documentation updates
- Definition of Done checklist

---

## Production Infrastructure

- **Dockerfile**: Multi-stage build (Node.js 22 alpine builder → production image)
- **Migration Runner**: `server/src/platform/storage/postgres/migrationRunner.ts` — auto-applies pending migrations on startup (skips when STORAGE_PROVIDER=inmemory)
- **Nginx Config**: `deploy/nginx.conf` — reverse proxy with WebSocket support, gzip, security headers
- **Docker Compose**: `deploy/docker-compose.yml` — full stack (app + postgres + nginx)
- **Backup Script**: `scripts/backup-database.sh` — timestamped pg_dump with configurable retention
- **Deployment Guide**: `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`

---

## Last Changes

- July 24, 2026: CORE-1b verified — blueprints, versions, generation executions, conversations, and messages now use the configured storage boundary. GitHub Actions passed TypeScript, lint, formatting, full tests, repository validation, commitlint, real PostgreSQL restart recovery, ownership isolation, and the merge gate. See `CORE-1B_DURABLE_RUNTIME.md`.
- July 24, 2026: CORE-1a implemented — one configured storage provider now backs identities, users, projects, generation history, and API keys; project ownership is mandatory and browser patches are allow-listed. See `CORE-1A_DURABLE_PROJECTS.md`.
- July 24, 2026: CUTOVER-0 and CI-BASELINE-1 merged — governance and portable CI are complete on the active backend integration branch; the standalone frontend CI is merged on `main`.
- July 16, 2026: Autonomous Pipeline real-time integration complete — events emitted via PipelineEventEmitter, AgentBoard shows phases live, Socket.IO primary transport with polling fallback, step.failed handling added.
