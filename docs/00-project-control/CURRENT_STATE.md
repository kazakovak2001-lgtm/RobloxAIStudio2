# Current Project State

**Last Updated**: August 8, 2026
**Phase**: REPAIR-1A/1B landed — artifact-applying repair exists for one strategy and now redelivers to Studio; rollback/audit (REPAIR-1C) is next
**Build Status**: Current runtime pair is backend `6ec42d55a74bab0a9001d7e66c02795f01b41886` (release/cutover-1e-candidate, merged PR #187) plus protected Frontend contents `kazakovak2001-lgtm/Frontend@33cb19310ad15097eac1ff53832ee7d8191bd65e` (main, merged PR #38 — unchanged since REPAIR-1B is backend-only). The reciprocal production, clean-clone, PostgreSQL restart, release-image, composed-release, security and Merge Gate chain must remain exact-pair bound. STUDIO-ACCEPT-1 passed on backend acceptance commit `3230d2368ed781043fe9f3520c0d3de3836ec3bb`. A Roblox Studio Play-mode runtime playtest on the RUNTIME-PLAYTEST-1 pair passed with operator-observed evidence recorded in [RUNTIME-PLAYTEST-1_RESULT.md](./RUNTIME-PLAYTEST-1_RESULT.md). REPAIR-1A replaced the simulated repair engine with a real, artifact-applying, single-strategy repair (`regenerate_script`, whole-package regeneration validated by the same playability gate as generation). REPAIR-1B added `POST /api/repair/:projectId/deliver`, which resolves the latest repaired execution server-side and pushes it to a connected Studio client through the existing sync pipeline; it does not yet support rollback/audit or a canonical-execution UI — that is REPAIR-1C. No external production deployment is claimed.

---

## Architecture

### Backend

- **Server**: Express + Socket.io (Node.js/TypeScript)
- **Files**: 635 TypeScript files under `server/src`: 555 production files and 80 test files across 46 real top-level subsystems
- **API Routes**: 30 unique mounted `/api` prefixes (`/api/projects` mounts two routers), plus health and root endpoints
- **AI Providers**: 6 configurable modes (OpenAI, Anthropic, Gemini, Groq, Ollama, OpenRouter), plus no-provider stub behavior and test mocks
- **Storage**: One configured provider per process; PostgreSQL migrations and cache hydration complete before the server listens. `STORAGE_PROVIDER=postgres` requires `DATABASE_URL`.
- **Durable records**: identities, sessions, users, projects, generation history, API keys, blueprints, blueprint versions, generation executions, pipeline artifacts and lifecycle state, autonomous sessions/checkpoints, Studio command/verification evidence, conversations, and conversation messages use the configured storage boundary.
- **Studio runtime**: project sync, plugin registration, artifact snapshots, transfer, the outbound command lifecycle, acknowledgement/result processing, and exact artifact ID/hash verification use one shared Studio v2 runtime. Serializable command and verification evidence is provider-backed; live clients, sockets, timers and callbacks remain explicitly process-local. Project sync selects the newest completed artifact-bearing execution and never creates placeholder Lua/config packages. Queue delivery alone never marks an import verified.
- **Generation-to-Studio boundary**: the existing `GenerationArtifactRecorder` preserves canonical `scripts[]` payloads and normalizes current `LuaGeneratorAgent` server/client/shared/module `{ name, code }` groups into validated Studio `{ path, content }` scripts. Empty, malformed, duplicate-path, placeholder, and non-playable Lua output is rejected before queueing. PR #174 preserves project metadata, repairs one semantically invalid real-provider response, and requires server world/interactivity plus a client HUD before Studio delivery.
- **Canonical Studio plugin**: `studio-plugin/` v1.8 reuses the existing connector, lifecycle manager, sync manager, artifact loader, events, and UI. It connects with the exact backend project ID, polls `EXPORT_PROJECT`, acknowledges delivery, materializes structured Lua scripts and non-Lua metadata as Roblox instances, reports one exact ID/hash receipt per pipeline artifact, and shows Verified only after the backend accepts the evidence. Roblox-owned JSON content type is provided through `Enum.HttpContentType.ApplicationJson`; the plugin does not submit a forbidden custom `Content-Type` header.
- **Studio plugin package**: `npm run studio:package` creates a deterministic installable `.rbxmx`, a source/bundle manifest, and SHA-256 checksums from an explicit active-module allowlist. The dedicated package workflow validates XML structure and checksums before uploading the desktop acceptance artifact.
- **Verified acceptance package**: workflow run `30277078815`, artifact ID `8657228073`, bundle size `45932` bytes, bundle SHA-256 `a97e6268193f202cb5cc12ef5c174d0a028067c382327dd9432aacbe80f5ced7`, manifest SHA-256 `0655ae43b48f8c3bb90591da1e35170ff122136f8352bad73320c88c0eca3f14`.
- **Current STUDIO-ACCEPT-1 package**: local deterministic package from backend `3230d2368ed781043fe9f3520c0d3de3836ec3bb`, bundle size `47969` bytes, bundle SHA-256 `86e102b663d48925f9e313248761bb2d91d7e0794252f6c04e50496d8ba05696`, manifest SHA-256 `4a249efdbf12acf440298992435dc74865673fbe8e357df809edae93b2701dfc`.
- **Real-time**: Socket.io with 50+ event types, project rooms, and storage-backed opaque-session authentication in production
- **Authentication**: bcrypt password hashing (cost 12), storage-backed opaque sessions/roles, cookie-only browser credential delivery, and production REST/Socket validation. Register/login/refresh JSON is credential-free. High-entropy refresh values are stored only as SHA-256 digests with a bounded digest index, migrated before startup traffic, and consumed before rotation; access cookies cover `/` for Socket.IO, refresh cookies are endpoint-scoped, and production policy is `Secure`, `HttpOnly`, `SameSite=Lax`, host-only.

### Canonical Frontend

- **Repository**: [kazakovak2001-lgtm/Frontend](https://github.com/kazakovak2001-lgtm/Frontend) on `main`
- **Acceptance commit**: `a8d005d433d48e18d8e64ac176ee63c9c694b644`, independently matched to the ZIP used during the successful STUDIO-1 session.
- **Initial SSR release commit**: `1036c3ef9705d145cb9700cd14268a33d2abdd58`, merged through Frontend PR #12 after CI run #65 verified the production image, `/health`, SSR `/`, responsive QA, and Merge Gate.
- **Active paired release contents**: `33cb19310ad15097eac1ff53832ee7d8191bd65e`, including the INTEGRATION-1B browser-recovery proof, retained by the protected release inventory.
- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS
- **Routing and state**: TanStack Router/Query, typed backend adapter, Socket.IO realtime client
- **Ownership**: All new user-facing web functionality belongs in the standalone repository.
- **Current Workspace**: `/projects/$projectId` is organized as Define → Generate → Validate → Integrate → Operate. It uses one persisted Workspace read model, one stage-scoped backend tool registry, typed run/context summaries, durable history, existing chat/realtime/Studio contracts, and production responsive QA at 1440 px, 1024 px, and 390 px. No parallel Workspace or duplicate transport layer was introduced.

### Legacy Frontend

- **Historical location**: repository root `src/`
- **Status**: Physically removed by the CLEANUP-1C implementation; its exact 168-file baseline remains recorded in Git history and the cleanup inventory.
- **Canonical replacement**: `kazakovak2001-lgtm/Frontend` remains the only web client.
- **Guard**: The cleanup audit requires the exact removal diff and the architecture validator fails if root `src/` is reintroduced.

### TECH-AUDIT-2 Evidence Baseline

The TECH-AUDIT-2 figures below are the dated July 28 audit baseline, not the
current DATA-202 release counts. Current release evidence is 80 passing backend
test files / 829 passing tests, one skipped file / two skipped PostgreSQL-gated
tests locally, plus a green protected PostgreSQL Restart E2E job.

- Backend: 61 passing test files, 672 passing tests, one skipped test file/test; typecheck, lint, format, build, PostgreSQL restart, release image, composed HTTPS, rollback, and cleanup invariant gates pass.
- Frontend: TypeScript, production build, SSR image, responsive QA, and 12 native Workspace tests pass. The exact 40-check production-mode integration suite is protected by Frontend Merge Gate and records both repository SHAs plus runtime evidence.
- Frontend quality gap: lint reports 640 errors and 12 warnings; 70 files fail a separate Prettier check. Frontend CI currently runs neither gate.
- Architecture gap: the manifest models 32 domains while 46 subsystems exist. The generated report contains four cycles and status `FAIL`, but the current CLI exits successfully.
- Planning baseline: the evidence-scored feature matrix averages 66%; this is a prioritization aid, not a release SLA or substitute for closing P0 findings.

See [Technical Audit v2.0](../02-audits/technical-v2/EXECUTIVE_AUDIT.md) for the complete evidence, limitations, and recommended order.

---

## Completed Phases

| Phase             | Description                                               | Date           |
| ----------------- | --------------------------------------------------------- | -------------- |
| UX-3              | Initial Implementation                                    | July 2026      |
| UX-3A             | Forensic Audit                                            | July 2026      |
| UX-3B             | Architecture Stabilization Planning                       | July 2026      |
| UX-3C             | Execution Planning                                        | July 2026      |
| UX-3D Sprint 1    | Duplicate Consolidation                                   | July 15, 2026  |
| UX-3D Sprint 2    | shared/ui Migration                                       | July 15, 2026  |
| UX-3D Sprint 3    | Repository Structure Execution                            | July 15, 2026  |
| UX-3D Sprint 4    | Import & Path Alias Migration                             | July 15, 2026  |
| UX-3D Sprint 5    | Legacy Cleanup                                            | July 15, 2026  |
| UX-3D Sprint 6    | Design System Enforcement                                 | July 15, 2026  |
| UX-3D Sprint 7    | Documentation Synchronization                             | July 15, 2026  |
| UX-3D Sprint 8    | Final Validation & Closure                                | July 15, 2026  |
| UX-4 Preparation  | Development Readiness                                     | July 15, 2026  |
| UX-4.0            | Product Roadmap Definition                                | July 15, 2026  |
| UX-4 Phase 1      | Must Have Features (F-1, F-2, F-3)                        | July 15, 2026  |
| UX-4 Phase 2A     | Should Have Features (F-4 to F-8)                         | July 15, 2026  |
| UX-4 Phase 2B     | Infrastructure (F-9, F-10, F-11)                          | July 15, 2026  |
| CUTOVER-0         | Standalone frontend governance                            | July 24, 2026  |
| CI-BASELINE-1     | Portable CI and repository hygiene                        | July 24, 2026  |
| CORE-1a           | Durable identity, projects, and ownership                 | July 24, 2026  |
| CORE-1b           | Durable blueprints, executions, chat, restart E2E         | July 24, 2026  |
| WORKSPACE-1       | Workflow Workspace, scoped tools, logic and QA            | July 24, 2026  |
| STUDIO-1a         | Durable canonical generation artifact lineage             | July 24, 2026  |
| STUDIO-1b         | Shared Studio runtime and real artifact queue             | July 24, 2026  |
| STUDIO-1c backend | ACK/result state machine and exact evidence verification  | July 24, 2026  |
| STUDIO-1d plugin  | Canonical plugin command/import contract                  | July 24, 2026  |
| STUDIO-1e package | Deterministic installable plugin and acceptance runbook   | July 25, 2026  |
| STUDIO-1f fixes   | Real desktop transport, artifact, and routing fixes       | July 27, 2026  |
| STUDIO-1g         | Real desktop import and backend verification              | July 27, 2026  |
| CUTOVER-1A        | Backend-only production release artifact                  | July 27, 2026  |
| CUTOVER-1B        | Standalone Frontend SSR release artifact                  | July 27, 2026  |
| CUTOVER-1C        | Composed HTTPS release and authenticated transports       | July 27, 2026  |
| CUTOVER-1D        | Release-baseline readiness and rollback rehearsal         | July 28, 2026  |
| CUTOVER-1E        | Controlled default-branch promotion                       | July 28, 2026  |
| CUTOVER-1F        | Promoted baseline CI alignment                            | July 28, 2026  |
| CLEANUP-1A        | Legacy frontend decommission audit                        | July 28, 2026  |
| CLEANUP-1B        | Legacy frontend tooling decoupling                        | July 28, 2026  |
| CLEANUP-1C        | Legacy frontend physical removal                          | July 28, 2026  |
| CLEANUP-1D        | Post-removal verification and permanent guard             | July 28, 2026  |
| TECH-AUDIT-2      | Two-repository technical and architecture baseline        | July 28, 2026  |
| SEC-201           | Cookie-only browser auth and refresh protection           | July 28, 2026  |
| FE-201            | Real Studio verification in the canonical Workspace       | July 28, 2026  |
| INT-201           | Reciprocal protected 40-check production contract         | July 28, 2026  |
| DOC-201           | Active auth/release authority and terminology guard       | July 28, 2026  |
| DATA-201          | Durable write cutover and compatibility-write removal     | July 31, 2026  |
| DATA-202A         | Pipeline lifecycle persistence and restart truthfulness   | July 31, 2026  |
| DATA-202B         | Autonomous session/checkpoint persistence                 | July 31, 2026  |
| DATA-202C         | Studio evidence persistence and runtime ownership audit   | July 31, 2026  |
| DOC-202A          | Documentation authority inventory and deterministic guard | August 3, 2026 |
| INTEGRATION-1A    | Frontend/backend contract and clean-clone verification    | August 4, 2026 |
| INTEGRATION-1B    | PostgreSQL restart recovery and lifecycle validation      | August 5, 2026 |
| ROADMAP-AUDIT-1   | Evidence-based roadmap reconciliation                     | August 5, 2026 |
| STUDIO-ACCEPT-1   | Real Studio delivery on project-scoped API authority      | August 6, 2026 |

---

## Historical Feature Completion Status

> The table below records the UX-4 delivery history for the embedded frontend. It is not the source of truth for current production completeness or new standalone frontend work. See [FRONTEND_CUTOVER.md](./FRONTEND_CUTOVER.md) and the current [FEATURE_MATRIX.md](../02-audits/technical-v2/FEATURE_MATRIX.md).

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
| F-10 | Real Authentication      | ✅ Complete  | bcrypt, opaque-session validation, httpOnly cookies  |
| F-11 | Persistent Storage       | ✅ Complete  | PostgreSQL with InMemory fallback                    |

---

## Security Hardening Status (Release Sprint)

| Task | Description                                 | Status                                 |
| ---- | ------------------------------------------- | -------------------------------------- |
| 1    | Bug condition exploration tests             | ✅ Complete                            |
| 2    | Preservation property tests                 | ✅ Complete                            |
| 3    | Auth route PUBLIC_PREFIXES fix              | ✅ Complete                            |
| 4    | bcrypt password hashing (replaces SHA-256)  | ✅ Complete                            |
| 5    | httpOnly cookie delivery                    | ✅ Cookie-only browser responses       |
| 6    | Opaque-session validation in authMiddleware | ✅ Complete                            |
| 7    | Socket.IO opaque-session validation         | ✅ Complete                            |
| 8    | Dead code removal                           | ✅ Historical scope complete           |
| 9    | Documentation synchronization               | ✅ DOC-201 implemented under issue #49 |
| 10   | Production infrastructure                   | ✅ Complete                            |
| 11   | Final verification and release report       | ✅ Historical release scope complete   |
| 12   | Checkpoint — protected backend checks pass  | ✅ Complete                            |

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

1. **Runtime playtest authority (P1)**: the current `PlaytestEngine` performs deterministic static analysis and records `runtimeExecuted=false`; it is not a Roblox runtime verdict.
2. **Repair authority (P1)**: manual repair-and-redeliver now works end-to-end via `POST /api/repair/run` then `POST /api/repair/:projectId/deliver` (REPAIR-1A/1B), but the autonomous-phase `RepairAdapter` remains unavailable and is not wired into the autonomous orchestration loop; rollback/audit and a canonical-execution UI (REPAIR-1C) also remain open.
3. **Native delivery breadth (P2)**: asset generation produces validated definitions/placeholders rather than authoritative uploaded Roblox assets, GUI, and complete place delivery.
4. **Autonomous collaboration (P2)**: orchestration and durable sessions exist, but the bounded collaboration path reports `executedTaskCount=0` and remains preview-only.
5. **Studio protocol diagnostics (P2)**: STUDIO-ACCEPT-1 observed one non-blocking startup `/api/studio/protocol/message` 400 response, a missing `rbxassetid://0` toolbar icon, and one post-save `Callbacks cannot yield` message. Each requires independent reproduction before a production change.

Project-scoped Studio API-key authority is resolved by PR #171. The exhaustive
architecture build gate is restored by PR #172. Current desktop evidence is
recorded in `STUDIO-ACCEPT-1_DESKTOP_ACCEPTANCE_RESULT.md`.

---

## Technical Debt

TECH-AUDIT-2 remains historical planning evidence. ROADMAP-AUDIT-1 (#169)
supersedes its ordering after verifying the current code at exact backend and
Frontend baselines. Authoritative Roblox runtime playtest evidence
(RUNTIME-PLAYTEST-1) is complete. Artifact-applying repair and revalidation
(REPAIR-1) is in progress: sub-phase 1A landed a real single-strategy repair
loop (backend PR #185, Frontend companion PR #38) and sub-phase 1B landed
Studio redelivery of repaired artifacts (backend PR #187); rollback/audit
(1C) remains. Studio sync hardening (#168 and Frontend #32) is
complete, verified against backend PR #176 and Frontend PR #34/#37. Native
asset/GUI delivery, broader autonomous agent execution, and production
observability remain separate backlog items.

See [TECHNICAL_DEBT.md](../02-audits/technical-v2/TECHNICAL_DEBT.md) for definitions of done and [SPRINT_BACKLOG.md](../02-audits/technical-v2/SPRINT_BACKLOG.md) for ordered implementation work.

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
- **Standalone Frontend release image**: active paired Frontend contents `33cb19310ad15097eac1ff53832ee7d8191bd65e` package `.output` plus one shared worker-to-Node adapter as a non-root SSR process.
- **Historical REL-202 composed HTTPS evidence**: backend source `010532f0b162097c8a645b1dc07c89081d25cb99` and exact Frontend contents `9495b696cf22c84cf61375f7df22e5ac5907cc3c` passed CI Pipeline #1073 (`30667404383`). The promoted backend merge `a33a8c30588f1e4705d27856e61d839c8efd42ac` has the same file tree. This retained evidence proves the prior DATA-202 pair; the active REL-203 pair is defined by the release inventory and its protected PR chain. External deployment remains a separate unchecked operation.
- **Migration Runner**: `server/src/platform/storage/postgres/migrationRunner.ts` — auto-applies pending migrations on startup (skips when STORAGE_PROVIDER=inmemory).
- **Rollback inventory**: CUTOVER-1A and CUTOVER-1B remain independently deployable and are unaffected by removal of the non-executable combined stack. The deleted legacy source/configuration/deployment inventory remains recoverable by reverting the focused CLEANUP-1C change from baseline `85a2fa8d512738e6d02ffae42da77af7a27db6fc`. The promoted default and pinned pre-promotion rollback reference remain protected.
- **Backup Script**: `scripts/backup-database.sh` — timestamped pg_dump with configurable retention
- **Deployment Guide**: `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`

---

## Last Changes

- August 8, 2026: REPAIR-1B completed — backend PR #187 (`6ec42d55a74bab0a9001d7e66c02795f01b41886`) added `POST /api/repair/:projectId/deliver`, which resolves the latest repaired execution server-side from the repair session's own history and reuses the existing `StudioIntegrationManager` sync pipeline unchanged to deliver it to a connected Studio client; no Studio plugin or Frontend changes were needed. A design review also surfaced and fixed a real bug in `RepairEngine.run()` (session history was overwritten instead of appended across calls), plus two CodeRabbit findings fixed in a follow-up commit before merge: a concurrent-run race and an execution-id collision between two successful repairs of the same parent. Studio redelivery is now real end-to-end; rollback/audit and a canonical-execution UI (REPAIR-1C) remain.
- July 31, 2026: FRONTEND-2C completed through protected quality and cleanup (PR #18), production bundle budgets (PR #19), Lucide import hygiene and tightened budgets (PR #20), and authentication/realtime recovery coverage (PR #21). Canonical `Frontend/main` is `022788ace31982e2b08ea099800de784b4dbe482`; Frontend CI #140 passed all 10 jobs with 22 workspace tests and the protected 40-check backend contract. REL-203 issue #144 promotes this exact source into the backend release pairing.
- July 31, 2026: DATA-202 completed through pipeline persistence (PR #137), autonomous session/checkpoint persistence (PR #139), and Studio operational evidence plus runtime ownership classification (PR #141). The final protected source head `010532f0b162097c8a645b1dc07c89081d25cb99` passed CI Pipeline #1073 and merged as `a33a8c30588f1e4705d27856e61d839c8efd42ac`. Compatibility-write inventory remains zero; 23 operational runtime owners are explicitly classified. The exact Frontend contents remain `9495b696cf22c84cf61375f7df22e5ac5907cc3c`.
- July 31, 2026: REL-202 records the current DATA-202 release candidate, immutable CI artifact digests, preserved rollback reference and the boundary between verified CI composition and an unperformed external deployment. Issue #142 tracks the documentation-only closeout.
- July 28, 2026: HARDEN-2A / DOC-201 synchronized the active authentication and two-repository deployment guides, linked their claims to native/composed/protected evidence, annotated the conflicting July 16 decision records as superseded, and expanded the auth-contract test into a search-based authority guard. Issue #49 tracks the focused documentation-only implementation.
- July 28, 2026: HARDEN-2A / INT-201 completed in both repositories. Frontend PR #16 merged as `739b43cbc5f991c1852e80b30fe38c0e7c02d681`; backend PR #48 merged as `b30be04ce3c5458902561472d371f753b28f08c5` after its CodeRabbit supply-chain finding was fixed with read-only job permissions, non-persisted checkout credentials, and a single inventory-backed Frontend pin. Backend post-merge run #307 passed all protected jobs and 40/40 production checks. Contract artifact `8684538568` has digest `sha256:0babbaf1239615e15479a4adbbcc5f5745965632fb3417c06bc2ee9a70c3c0a9`.
- July 28, 2026: HARDEN-2A / FE-201 merged through Frontend PR #14 as `2aab7c3367bb55520edc2576422ebafec265d7c6`. The Workspace now parses and renders verified, pending, failed, malformed, and disconnected Studio status instead of hardcoding verification false.
- July 28, 2026: HARDEN-2A / SEC-201 removed reusable credentials from register/login/refresh JSON while preserving user/role metadata and httpOnly cookie auth. Refresh credentials are now 256-bit random values persisted only as SHA-256 digests with direct digest lookup, migrated from legacy plaintext records before startup traffic, and consumed before replacement so replay fails. Four native production-contract tests cover body shape, cookie policy, digest-only storage, migration, rotation, replay rejection, `/auth/me`, and active terminology. The composed HTTPS verifier now checks register/login/refresh body safety and rotation alongside REST and Socket.IO. Local verification passed `npm run ci` (62 test files passed, one skipped; 676 tests passed, one skipped), the production backend build, all 1,096 tracked-path invariants, and the pinned Frontend workspace tests/build. Issue #45 is closed as completed.
- July 28, 2026: TECH-AUDIT-2 established the first official backend + standalone Frontend baseline at backend `a2f596dcb03d92791f96d1b217bf33a534eeddcb` and Frontend `1036c3ef9705d145cb9700cd14268a33d2abdd58`. The audit inventories 46 backend subsystems, the 99-file Frontend TypeScript surface, and the 14-source Studio plugin; reconciles historical completion claims; records 16 prioritized debt items; and orders HARDEN-2A → ARCH-2B → FRONTEND-2C → RUNTIME-2D → DURABILITY-2E → STUDIO-2F. Seven deliverables live under `docs/02-audits/technical-v2/`.
- July 28, 2026: The schema-v5 steady-state cleanup guard merged through PR #43 as `a2f596dcb03d92791f96d1b217bf33a534eeddcb`. Post-merge CI run `30338196639` (#298) passed and artifact `8680037918` (`post-removal-invariant-audit`, digest `sha256:c7e908d07c64c8e6b9b5cf654d94501dbe9a25d85162e7c4d5638cab9e1528bb`) preserves historical cleanup proof without freezing future reviewed changes.
- July 28, 2026: CLEANUP-1D completed through PR #42 and merge commit `f924079995059d9b86a5caaaf6364cb7b4879881` with zero file deletions. All six review findings were resolved in follow-up commit `5a7d9c84f8aabf6618684ecfdd77bc176283a925`, including traversal-safe path classification and stateless import guards. Pre-merge CI run `30336635283` (#295) and post-merge push run `30336910264` (#296) passed every applicable job and Merge Gate. Post-merge evidence artifact `8679552100` (`cleanup-1d-post-removal-verification`, digest `sha256:a8fa2cea2192b4f69471926521678307a0409e3a053c699f5783fdbfb04aa14c`) confirms 26 historical implementation paths, zero deletions, all 176 removed paths absent, all 12 removed packages without consumers, 1,088 deterministic tracked paths, and zero release-isolation violations. Issue #41 is closed. The schema-v5 guard now verifies these invariants without freezing future repository changes. See `docs/project/CLEANUP-1D_POST_REMOVAL_VERIFICATION.md`.
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
