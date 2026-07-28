# Current Project State

**Last Updated**: July 28, 2026
**Phase**: CLEANUP-1C complete — CLEANUP-1D is next
**Build Status**: CUTOVER-1A through CUTOVER-1F and CLEANUP-1A through CLEANUP-1C are complete on the protected default branch `release/cutover-1e-candidate`. CLEANUP-1C removed all 168 embedded frontend source files, five root frontend configuration files, and three archival combined-deployment files; pruned 12 proven legacy-only direct package declarations; retained active `socket.io-client`; and left backend, Studio, standalone Frontend, composed-release, and rollback contracts unchanged. PR #39 merged as `1bc54753783610827750dbb11689c0fb24620923`. Post-merge push CI run `30330505927` (#291) passed every applicable job and Merge Gate. Evidence artifact `8677218198` has digest `sha256:b7693a9fac74b6e6615b5ba277e98ccb8575d21147e381d9ebcb5e400c89f74f`. Issue #37 is closed; CLEANUP-1D post-removal verification is next.

---

## Architecture

### Backend

- **Server**: Express + Socket.io (Node.js/TypeScript)
- **Files**: 576 TypeScript files in 48 subsystems
- **API Routes**: 28 registered endpoint groups (+ health, root)
- **AI Providers**: 7 (OpenAI, Anthropic, Gemini, Groq, Ollama, OpenRouter, Mock)
- **Storage**: One configured provider per process; PostgreSQL migrations and cache hydration complete before the server listens. `STORAGE_PROVIDER=postgres` requires `DATABASE_URL`.
- **Durable records**: identities, sessions, users, projects, generation history, API keys, blueprints, blueprint versions, generation executions, pipeline artifacts, conversations, and conversation messages use the configured storage boundary.
- **Studio runtime**: project sync, plugin registration, active sessions, artifact snapshots, transfer, the outbound command ledger, acknowledgement/result processing, and exact artifact ID/hash verification use one shared Studio v2 runtime. Project sync selects the newest completed artifact-bearing execution and never creates placeholder Lua/config packages. Queue delivery alone never marks an import verified.
- **Generation-to-Studio boundary**: the existing `GenerationArtifactRecorder` preserves canonical `scripts[]` payloads and normalizes current `LuaGeneratorAgent` server/client/shared/module `{ name, code }` groups into validated Studio `{ path, content }` scripts. Empty, malformed, and duplicate-path Lua output is rejected before queueing.
- **Canonical Studio plugin**: `studio-plugin/` v1.8 reuses the existing connector, lifecycle manager, sync manager, artifact loader, events, and UI. It connects with the exact backend project ID, polls `EXPORT_PROJECT`, acknowledges delivery, materializes structured Lua scripts and non-Lua metadata as Roblox instances, reports one exact ID/hash receipt per pipeline artifact, and shows Verified only after the backend accepts the evidence. Roblox-owned JSON content type is provided through `Enum.HttpContentType.ApplicationJson`; the plugin does not submit a forbidden custom `Content-Type` header.
- **Studio plugin package**: `npm run studio:package` creates a deterministic installable `.rbxmx`, a source/bundle manifest, and SHA-256 checksums from an explicit active-module allowlist. The dedicated package workflow validates XML structure and checksums before uploading the desktop acceptance artifact.
- **Verified acceptance package**: workflow run `30277078815`, artifact ID `8657228073`, bundle size `45932` bytes, bundle SHA-256 `a97e6268193f202cb5cc12ef5c174d0a028067c382327dd9432aacbe80f5ced7`, manifest SHA-256 `0655ae43b48f8c3bb90591da1e35170ff122136f8352bad73320c88c0eca3f14`.
- **Real-time**: Socket.io with 50+ event types, project rooms, JWT-authenticated handshake (production)
- **Authentication**: bcrypt password hashing (cost 12), storage-backed sessions/roles, cryptographic validation, httpOnly cookie delivery

### Canonical Frontend

- **Repository**: [kazakovak2001-lgtm/Frontend](https://github.com/kazakovak2001-lgtm/Frontend) on `main`
- **Acceptance commit**: `a8d005d433d48e18d8e64ac176ee63c9c694b644`, independently matched to the ZIP used during the successful STUDIO-1 session.
- **SSR release commit**: `1036c3ef9705d145cb9700cd14268a33d2abdd58`, merged through Frontend PR #12 after CI run #65 verified the production image, `/health`, SSR `/`, responsive QA, and Merge Gate.
- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS
- **Routing and state**: TanStack Router/Query, typed backend adapter, Socket.IO realtime client
- **Ownership**: All new user-facing web functionality belongs in the standalone repository.
- **Current Workspace**: `/projects/$projectId` is organized as Define → Generate → Validate → Integrate → Operate. It uses one persisted Workspace read model, one stage-scoped backend tool registry, typed run/context summaries, durable history, existing chat/realtime/Studio contracts, and production responsive QA at 1440 px, 1024 px, and 390 px. No parallel Workspace or duplicate transport layer was introduced.

### Legacy Frontend

- **Historical location**: repository root `src/`
- **Status**: Physically removed by the CLEANUP-1C implementation; its exact 168-file baseline remains recorded in Git history and the cleanup inventory.
- **Canonical replacement**: `kazakovak2001-lgtm/Frontend` remains the only web client.
- **Guard**: The cleanup audit requires the exact removal diff and the architecture validator fails if root `src/` is reintroduced.

### Health Scores

- Architecture Health: 9.2/10
- Design System Compliance: 95%
- Engineering Handbook Compliance: 88%
- Import Strategy: 100%
- Technical Debt: 2 remaining items (96% resolved from baseline of 47)

---

## Completed Phases

| Phase             | Description                                              | Date          |
| ----------------- | -------------------------------------------------------- | ------------- |
| UX-3              | Initial Implementation                                   | July 2026     |
| UX-3A             | Forensic Audit                                           | July 2026     |
| UX-3B             | Architecture Stabilization Planning                      | July 2026     |
| UX-3C             | Execution Planning                                       | July 2026     |
| UX-3D Sprint 1    | Duplicate Consolidation                                  | July 15, 2026 |
| UX-3D Sprint 2    | shared/ui Migration                                      | July 15, 2026 |
| UX-3D Sprint 3    | Repository Structure Execution                           | July 15, 2026 |
| UX-3D Sprint 4    | Import & Path Alias Migration                            | July 15, 2026 |
| UX-3D Sprint 5    | Legacy Cleanup                                           | July 15, 2026 |
| UX-3D Sprint 6    | Design System Enforcement                                | July 15, 2026 |
| UX-3D Sprint 7    | Documentation Synchronization                            | July 15, 2026 |
| UX-3D Sprint 8    | Final Validation & Closure                               | July 15, 2026 |
| UX-4 Preparation  | Development Readiness                                    | July 15, 2026 |
| UX-4.0            | Product Roadmap Definition                               | July 15, 2026 |
| UX-4 Phase 1      | Must Have Features (F-1, F-2, F-3)                       | July 15, 2026 |
| UX-4 Phase 2A     | Should Have Features (F-4 to F-8)                        | July 15, 2026 |
| UX-4 Phase 2B     | Infrastructure (F-9, F-10, F-11)                         | July 15, 2026 |
| CUTOVER-0         | Standalone frontend governance                           | July 24, 2026 |
| CI-BASELINE-1     | Portable CI and repository hygiene                       | July 24, 2026 |
| CORE-1a           | Durable identity, projects, and ownership                | July 24, 2026 |
| CORE-1b           | Durable blueprints, executions, chat, restart E2E        | July 24, 2026 |
| WORKSPACE-1       | Workflow Workspace, scoped tools, logic and QA           | July 24, 2026 |
| STUDIO-1a         | Durable canonical generation artifact lineage            | July 24, 2026 |
| STUDIO-1b         | Shared Studio runtime and real artifact queue            | July 24, 2026 |
| STUDIO-1c backend | ACK/result state machine and exact evidence verification | July 24, 2026 |
| STUDIO-1d plugin  | Canonical plugin command/import contract                 | July 24, 2026 |
| STUDIO-1e package | Deterministic installable plugin and acceptance runbook  | July 25, 2026 |
| STUDIO-1f fixes   | Real desktop transport, artifact, and routing fixes      | July 27, 2026 |
| STUDIO-1g         | Real desktop import and backend verification             | July 27, 2026 |
| CUTOVER-1A        | Backend-only production release artifact                 | July 27, 2026 |
| CUTOVER-1B        | Standalone Frontend SSR release artifact                 | July 27, 2026 |
| CUTOVER-1C        | Composed HTTPS release and authenticated transports      | July 27, 2026 |
| CUTOVER-1D        | Release-baseline readiness and rollback rehearsal        | July 28, 2026 |
| CUTOVER-1E        | Controlled default-branch promotion                      | July 28, 2026 |
| CUTOVER-1F        | Promoted baseline CI alignment                           | July 28, 2026 |
| CLEANUP-1A        | Legacy frontend decommission audit                       | July 28, 2026 |
| CLEANUP-1B        | Legacy frontend tooling decoupling                       | July 28, 2026 |

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

STUDIO-1 desktop delivery is no longer a known problem. The completed evidence is recorded in `STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md` and closed issue #15.

---

## Technical Debt (2 items)

1. **Broader frontend interaction coverage** (MEDIUM) — Workspace logic and production responsive gates are established. Expand coverage incrementally to authenticated mutations and long-running generation/realtime recovery.
2. **Missing JSDoc** (MEDIUM) — Components and services lack JSDoc documentation.

---

## Development Process

All implementation work must follow: `docs/templates/IMPLEMENTATION_TASK_TEMPLATE.md`

This template enforces:

- Pre-implementation verification (reuse before create)
- Consistent validation (backend TypeScript + architecture + tests)
- Mandatory documentation updates
- Definition of Done checklist

---

## Production Infrastructure

- **Backend release image**: `Dockerfile.backend` builds and starts the compiled backend without root `src/`, `public/`, Vite, or Tailwind inputs; CI verifies `GET /health`.
- **Backend/PostgreSQL composition**: `deploy/docker-compose.backend.yml` provides the independently verified backend and persistent database boundary.
- **Standalone Frontend release image**: Frontend commit `1036c3ef9705d145cb9700cd14268a33d2abdd58` packages `.output` plus one shared worker-to-Node adapter as a non-root SSR process.
- **Composed HTTPS release**: backend head `8bee44a284244033d73637b3e3cc4bddf72af035` and exact Frontend commit `1036c3ef9705d145cb9700cd14268a33d2abdd58` passed CI run `30312627413` (#219). Evidence artifact `8670986116` (`cutover-1c-composition-8bee44a284244033d73637b3e3cc4bddf72af035`, digest `sha256:6a941900d9b73bca852d1fe071f148d6ac19eae151b414a9e7f99aa3ad39b57a`) proves healthy PostgreSQL/backend/frontend/proxy services, HTTPS SSR and health, allowed/rejected production origins, secure host-only cookies, authenticated REST, unauthenticated Socket.IO rejection, and authenticated polling → WebSocket upgrade.
- **Migration Runner**: `server/src/platform/storage/postgres/migrationRunner.ts` — auto-applies pending migrations on startup (skips when STORAGE_PROVIDER=inmemory).
- **Rollback inventory**: CUTOVER-1A and CUTOVER-1B remain independently deployable and are unaffected by removal of the non-executable combined stack. The deleted legacy source/configuration/deployment inventory remains recoverable by reverting the focused CLEANUP-1C change from baseline `85a2fa8d512738e6d02ffae42da77af7a27db6fc`. The promoted default and pinned pre-promotion rollback reference remain protected.
- **Backup Script**: `scripts/backup-database.sh` — timestamped pg_dump with configurable retention
- **Deployment Guide**: `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`

---

## Last Changes

- July 28, 2026: CLEANUP-1C completed through PR #39 and merge commit `1bc54753783610827750dbb11689c0fb24620923` — 168 root `src/` files, five frontend entry/config files, and three archival combined-deployment files were deleted (176 paths total). Five runtime and seven development-only direct package declarations were pruned; `socket.io-client` remains because the active composed-release verifier consumes it. The existing production-readiness audit now checks the canonical Studio plugin instead of removed `src/shared`. Final PR CI run `30329991563` (#290), Studio Plugin Package run #27, and post-merge push run `30330505927` (#291) passed every applicable job and Merge Gate. Post-merge evidence artifact `8677218198` (`cleanup-1c-physical-removal`, digest `sha256:b7693a9fac74b6e6615b5ba277e98ccb8575d21147e381d9ebcb5e400c89f74f`) confirms the exact removal, synchronized root lockfile declarations, zero remaining package consumers, and active-release isolation. Issue #37 is closed; CLEANUP-1D is next. See `docs/project/CLEANUP-1C_PHYSICAL_REMOVAL.md`.
- July 28, 2026: CLEANUP-1B completed through PR #35 and merge commit `703fe0fbcfcb8706506e9351af1fe7874a1337f0` — root development/build/typecheck commands now target the backend, Vitest uses an explicit backend-only configuration, protected TypeScript and PostgreSQL CI reuse those commands, and architecture reporting identifies the standalone Frontend as canonical. PR CI run #282 and post-merge push run `30327587217` (#284) passed every applicable job and Merge Gate. Post-merge evidence artifact `8676270323` (`cleanup-1b-tooling-decoupling`, digest `sha256:5d14de17c49751392d009021dc9a7b14605447ae72d44e24414848d3331169ec`) confirms the exact 168-file legacy inventory, unchanged dependency maps and lockfile, active-release isolation, and `currentStageDeletionAuthorized=false`. Issue #34 is closed; CLEANUP-1C is next. See `docs/project/CLEANUP-1B_TOOLING_DECOUPLING.md`.
- July 28, 2026: CLEANUP-1A merged as `99b0de4a3b493d1e1fa98173deea8fae59d57842` — the audit classified all 168 tracked root `src/` files, package consumers, deployment inventory, tooling blockers, and ordered CLEANUP-1B/1C/1D waves without modifying legacy runtime files.
- July 27, 2026: CUTOVER-1C verified — backend head `8bee44a284244033d73637b3e3cc4bddf72af035` composed the exact Frontend release commit `1036c3ef9705d145cb9700cd14268a33d2abdd58` behind one HTTPS origin. CI run #219 and evidence artifact `8670986116` proved healthy services, SSR, CORS allow/deny behavior, secure host-only cookies, authenticated REST, unauthenticated Socket.IO rejection, and authenticated polling → WebSocket upgrade. The prior release stack and legacy frontend remain preserved for rollback. See `CUTOVER-1C_COMPOSED_RELEASE.md`.
- July 27, 2026: CUTOVER-1B completed — Frontend PR #12 merged as `1036c3ef9705d145cb9700cd14268a33d2abdd58`. One shared worker-to-Node adapter now serves both responsive QA and production. Frontend CI run #65 verified the non-root image, independent `/health`, root SSR document, desktop/tablet/mobile responsive QA, and Merge Gate. CUTOVER-1C is the next gate.
- July 27, 2026: CUTOVER-1A completed — backend PR #22 merged as `22852af9d4db30c4fff28ea5ef0c762aa3c0607a`. The backend-only production image builds without legacy frontend sources and passes its container health smoke gate.
- July 27, 2026: STUDIO-1g real desktop acceptance completed — standalone Frontend commit `a8d005d433d48e18d8e64ac176ee63c9c694b644` generated execution `exec-1785180356168`; plugin v1.8 on Roblox Studio `0.730.0.7300790` imported eight artifacts, created the expected Roblox instance hierarchy, returned exact receipts, and reached `Verified`. The authenticated project and session status matched project `proj-286c6929-5`, client `studio-39fa03bb`, session `session-afec81df-c`, command `cmd-96bd9df4-e`, and eight verified artifacts. Issue #15 is closed. See `STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md`.
- July 27, 2026: STUDIO-1f desktop findings resolved — PR #16 removed the Roblox-forbidden custom `Content-Type` header while retaining the canonical connector and protocol. PR #17 normalized the exact current `LuaGeneratorAgent` output at the existing `GenerationArtifactRecorder` boundary and rejects empty, malformed, or duplicate Lua artifacts before queueing. PR #19 preserved canonical specialist assignments when adaptive performance evidence is absent. Subsequent real desktop acceptance passed in STUDIO-1g.
- July 25, 2026: STUDIO-1e acceptance packaging verified — `npm run studio:package` now creates a deterministic installable `.rbxmx`, source/bundle manifest, and SHA-256 checksum file from the explicit active plugin allowlist. The package workflow parses the Roblox XML model, verifies checksums, and publishes a downloadable artifact. The standard test suite proves repeat builds are byte-identical, and the desktop runbook defines installation, status capture, evidence fields, and failure triage.
- July 24, 2026: STUDIO-1d canonical plugin implementation verified — existing plugin modules now use the correct dependency graph and backend project ID, poll and acknowledge `EXPORT_PROJECT`, materialize structured Lua scripts and non-Lua metadata as real Roblox instances, report exact ID/hash receipts, and expose Verified only after backend evidence acceptance. The plugin source contract is enforced by the normal test suite.
- July 24, 2026: STUDIO-1c backend slice complete — the shared Studio runtime now enforces polling → acknowledgement → result ordering, validates the exact durable execution ID and artifact ID/SHA-256 receipt set, records verified/failed session states, and exposes accurate additive project status fields. PR #10 delivered the contract; PR #11 restored canonical CI, removed temporary diagnostics, completed formatting, and passed every standard validation gate. See `STUDIO-1C_IMPORT_ACKNOWLEDGEMENT.md`.
- July 24, 2026: STUDIO-1b complete — project and plugin Studio routes now share one v2 runtime; project sync selects the newest completed artifact-bearing execution, queues real persisted artifacts through `EXPORT_PROJECT`, preserves incremental no-op behavior, and never creates placeholder Lua/config packages. PR #9 passed TypeScript, ESLint, Prettier, 717 tests, repository validation, commitlint, PostgreSQL restart E2E, and Merge Gate. See `STUDIO-1B_RUNTIME_CONSOLIDATION.md`.
- July 24, 2026: STUDIO-1a complete — canonical `PlanExecutor` outputs are recorded in the storage-backed `ArtifactStore` under durable generation execution IDs and survive PostgreSQL provider reconstruction. See `STUDIO-1A_ARTIFACT_LINEAGE.md`.
- July 24, 2026: WORKSPACE-1 complete — the standalone project route now uses five workflow stages, one persisted read model, stage-scoped advanced tools, typed context and result presenters, native workflow regression tests, and production-artifact responsive browser QA. Responsive QA found and fixed document-level chat scrolling, workflow shrink issues, and mobile manifest overflow.
- July 24, 2026: CORE-1b verified — blueprints, versions, generation executions, conversations, and messages now use the configured storage boundary. GitHub Actions passed TypeScript, lint, formatting, full tests, repository validation, commitlint, real PostgreSQL restart recovery, ownership isolation, and the merge gate. See `CORE-1B_DURABLE_RUNTIME.md`.
- July 24, 2026: CORE-1a implemented — one configured storage provider now backs identities, users, projects, generation history, and API keys; project ownership is mandatory and browser patches are allow-listed. See `CORE-1A_DURABLE_PROJECTS.md`.
- July 24, 2026: CUTOVER-0 and CI-BASELINE-1 merged — governance and portable CI are complete on the active backend integration branch; the standalone frontend CI is merged on `main`.
- July 16, 2026: Autonomous Pipeline real-time integration complete — events emitted via PipelineEventEmitter, AgentBoard shows phases live, Socket.IO primary transport with polling fallback, step.failed handling added.
