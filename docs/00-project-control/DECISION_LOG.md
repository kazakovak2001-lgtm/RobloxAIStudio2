# Decision Log

All significant architectural and product decisions are recorded here.

---

## 2026-08-06 — Exact Runtime Pair Authority

**Decision**: Define the current executable release pair as backend
`23e23c1c6733f0b3c52ff4f90fc6123b74c0cf72` and Frontend
`e89f93d88a3c181b65769641e1a586c86827a6c5`. Backend release integration owns
the Frontend pin; Frontend `config/integration/paired-release.json` is the
single backend-pin authority for its production, clean-clone and PostgreSQL
restart workflows.

**Rationale**: Independent hard-coded workflow pins had drifted to older
commits. Runtime identities are distinguished from subsequent control-only
commits so the two repositories do not require impossible circular commit
self-reference.

**Next gate**: Run both reciprocal protected contracts on the exact pair, then
continue to a fresh post-PR-174 Roblox runtime playtest. No external production
deployment is claimed.

---

## 2026-08-06 — STUDIO-ACCEPT-1 Closure and Runtime Priority

**Decision**: Accept the real Roblox Studio desktop evidence recorded under
issue #170 as completion of the canonical generated-artifact delivery gate.
Preserve static playtest as preflight-only and select authoritative
Studio-attached Roblox runtime evidence as the next product-critical phase.

**Evidence**: Backend `3230d2368ed781043fe9f3520c0d3de3836ec3bb`,
plugin bundle SHA-256
`86e102b663d48925f9e313248761bb2d91d7e0794252f6c04e50496d8ba05696`,
project `proj-00f43b57-b`, execution `exec-1785976885787`, command
`cmd-eef6e7bd-a`, eight exact receipts, Roblox Studio `0.733.0.7330989`,
plugin `Verified`, and backend `artifactVerified=true`.

**Dependency order**: Runtime playtest evidence precedes artifact-applying
repair and revalidation. Project sync hardening (#168 and Frontend #32) remains
valid lower-priority backlog and does not replace this product-critical path.

**Boundary**: This decision does not claim native asset upload, autonomous
repair, external deployment, or resolution of non-blocking Studio diagnostics.

**Status**: Complete evidence closeout; runtime playtest planning next.

---

## 2026-07-31 — REL-202 DATA-202 Release Evidence Closeout

**Decision**: Treat the already promoted
`release/cutover-1e-candidate` branch as the canonical backend release
reference and record the DATA-202 pair without performing a second branch
promotion. The current promoted merge is
`a33a8c30588f1e4705d27856e61d839c8efd42ac`; its file tree matches validated
source head `010532f0b162097c8a645b1dc07c89081d25cb99`. The canonical Frontend contents
remain `9495b696cf22c84cf61375f7df22e5ac5907cc3c`.

**Evidence**: CI Pipeline #1073 (`30667404383`) passed the full protected chain,
including PostgreSQL Restart E2E, backend image, 40/40 Frontend production
contract, composed HTTPS release, promoted-baseline integrity, rollback
rehearsal, post-removal invariants and Merge Gate. The contract artifact is
`8807497716` with digest
`sha256:abb2794feaa4290c9acc1570dc9890888bf8dc26807a11db68ada1196748b3b0`;
the composition artifact is `8807508318` with digest
`sha256:447e3b0f46d4299c0c54e1a2c499e1f855d33161ea45b4e88574a1a51563f64e`;
the promotion-integrity artifact is `8807532441` with digest
`sha256:c1d5310a7d03f7fbace0af0de6d044c2383068af4b48c4ef40de6f4cc31ad034`.

**Deployment boundary**: These artifacts prove the exact CI release
composition. They do not prove external image publication, production database
backup, remote TLS/host configuration, or post-deployment smoke checks. Those
production checklist items remain unchecked until executed against the target
environment.

**Rollback**: Preserve
`backup/default-before-cutover-1e@91a1626d080a4bc22ce20648c4ff10481ae6e299`
and the independently deployable backend/Frontend artifacts. Do not use the
removed historical combined stack.

**Status**: Documentation-only closeout tracked by issue #142. No runtime,
schema, contract, Frontend pin, branch topology or deployment mutation.

---

## 2026-07-28 — HARDEN-2A / DOC-201 Active Auth and Release Authority

**Decision**: Keep storage-backed opaque sessions and the independent backend /
standalone Frontend release topology as the only current auth and deployment
contract. The current project-control, authentication, deployment-guide, and
deployment-checklist files must state the actual `Secure`, `HttpOnly`,
`SameSite=Lax`, host-only cookie policy and scoped paths. Current claims must
link to native auth tests, the composed HTTPS verifier, and protected INT-201
evidence.

**Historical preservation**: Retain July 16 decision text as dated evidence, but
mark its signed-token/cryptographic terminology, incorrect strict cookie
attribute, embedded Frontend, and combined-Docker claims as superseded.
Historical wording is not current runtime or release guidance.

**Executable guard**: The existing HARDEN-2A auth-contract test scans the
authoritative file set for obsolete signed-token, signing-secret,
cryptographic-validation, and strict-site cookie claims. It also requires
supersession banners on the retained conflicting July 16 sections.

**Status**: Implemented under issue #49. Protected CI and review remain the
merge acceptance gate.

---

## 2026-07-28 — HARDEN-2A / INT-201 Protected Cross-Repository Contract

**Decision**: Protect the existing Frontend 40-check integration suite in both repositories with immutable cross-repository pins. Each job checks out the exact proposed source SHA, builds the backend-only production image, starts it with `NODE_ENV=production`, and runs the canonical Frontend contract. Both Merge Gates depend on their local contract job, so either repository blocks an incompatible auth, ownership-isolation, realtime, generation, module, or guarded Studio-sync change.

**Exact paired baseline**: Backend `b30be04ce3c5458902561472d371f753b28f08c5`; Frontend `739b43cbc5f991c1852e80b30fe38c0e7c02d681`. The backend workflow also replaces the earlier CUTOVER-1B Frontend pin in active composed-release and promoted-baseline checks. Historical CUTOVER evidence retains its original SHA.

**Evidence contract**: Every contract run records the exact backend and Frontend SHAs, explicit production runtime configuration, expected/completed check counts, per-check durations, final status, E2E output, health response, image inspection, and backend logs. The Frontend implementation merged through PR #16; post-merge run #72 passed 40/40 checks and Merge Gate, and artifact `8683827461` has digest `sha256:72e479cca3325067734dc1e61119ee00b81f52929342720e9bbd874620cf3761`. Backend PR #48 merged as `b30be04ce3c5458902561472d371f753b28f08c5`; post-merge CI run #307 passed every protected job, and contract artifact `8684538568` has digest `sha256:0babbaf1239615e15479a4adbbcc5f5745965632fb3417c06bc2ee9a70c3c0a9`.

**Security boundary**: The backend intentionally bypasses REST and Socket.IO authentication when `NODE_ENV !== production`. Development-mode runs remain useful for feature work but cannot prove authentication or cross-user isolation and do not satisfy INT-201. The in-memory provider is explicit for this short-lived authorization contract; PostgreSQL restart durability remains a separate required backend job.

**Status**: Complete and post-merge verified in both repositories. Frontend issue #15 and backend issue #47 are closed.

---

## 2026-07-28 — HARDEN-2A / SEC-201 Cookie-Only Browser Authentication

**Decision**: Keep the existing storage-backed opaque-session architecture and make the browser contract genuinely cookie-only. Register, login, and refresh continue to set scoped httpOnly cookies but return only non-secret user/session metadata. Do not introduce a signed-token format or a second Frontend transport.

**Refresh protection**: Generate 256-bit random refresh credentials, persist only SHA-256 digests, and maintain a digest-keyed lookup record. Refresh consumes the old digest index and access session synchronously before creating the replacement, so the same credential cannot be replayed in-process. Existing plaintext refresh records are converted after storage hydration and flushed before the server accepts traffic.

**Cookie policy**: Preserve the verified production contract: `Secure`, `HttpOnly`, `SameSite=Lax`, host-only; access path `/` for REST and Socket.IO, refresh path `/api/platform/auth/refresh`. Explicit Bearer input remains for non-browser tooling, body refresh input remains a compatibility fallback, and API-key clients are unchanged.

**Compatibility**: The standalone Frontend already uses `credentials: "include"` and reads only the returned user, so its login/register/refresh flow requires no transport change. Logout, `/auth/me`, REST middleware, and Socket.IO use the same access-session validation as before.

**Evidence**: Four native HARDEN-2A tests cover credential-free production responses, cookie attributes, digest-only storage, direct lookup, legacy migration, successful rotation, old-credential replay rejection, `/auth/me`, and authoritative terminology. The composed HTTPS release verifier now performs register/login/refresh body checks and refresh replay rejection in addition to existing REST and Socket.IO checks.

**Status**: Complete under closed issue #45 and merged backend PR #46.

---

## 2026-07-28 — TECH-AUDIT-2 Baseline and Corrective Sequence

**Decision**: Establish backend `a2f596dcb03d92791f96d1b217bf33a534eeddcb` and standalone Frontend `1036c3ef9705d145cb9700cd14268a33d2abdd58` as the first official two-repository technical audit baseline. Replace unsupported manual health/debt scores and “all features complete” as current planning signals with executable evidence and the TECH-AUDIT-2 feature/debt matrices.

**Evidence**: Backend protected checks pass with 61 test files and 672 tests plus one skip. Frontend TypeScript, seven native tests, build, SSR image, and responsive QA pass; all 40 production-mode cross-repository integration checks pass locally. Static audit found 46 real backend subsystems versus 32 modeled domains, four reported architecture cycles with a successful CLI exit, credentials returned in auth JSON despite httpOnly cookies, Frontend Studio verification hardcoded false, simulated autonomous phases, unprotected Frontend lint/format failures, and asynchronous PostgreSQL acknowledgement semantics.

**Terminology correction**: Production auth validates random opaque
storage-backed sessions, not self-contained client-verifiable tokens. Historical
signed-token wording records earlier intent and is not proof of the current
credential format. SEC-201 subsequently removed reusable credentials from
browser response bodies and protected refresh persistence/rotation.

**Ordered response**: Execute HARDEN-2A → ARCH-2B → FRONTEND-2C → RUNTIME-2D → DURABILITY-2E. Treat STUDIO-2F native assets/GUI/place work as optional expansion. Keep F-12 collaborative development deferred until authorization, runtime ownership, and durability gates pass.

**Preservation**: The audit changes documentation and planning only. It does not alter API/runtime behavior, dependencies, release topology, Frontend ownership, the canonical `PlanExecutor`, the Studio command/receipt protocol, protected branches, or repository history.

**Deliverables**: `docs/02-audits/technical-v2/{EXECUTIVE_AUDIT,MODULE_REGISTRY,FEATURE_MATRIX,ARCHITECTURE_GAP_REPORT,TECHNICAL_DEBT,ROADMAP_v2_UPDATE,SPRINT_BACKLOG}.md`.

**Status**: Complete. HARDEN-2A is next.

---

## 2026-07-28 — CLEANUP-1D Post-Removal Repository Verification

**Decision**: Complete the cleanup sequence with a focused, zero-deletion verification stage based on protected default `9a728661ee7b0a635af78da56a5d147b296dc23c`.
**Reason**: CLEANUP-1C removed the legacy web client, but older architecture helpers and three broad repository snapshots still modeled or listed the retired root. Leaving those contradictions would let agents and tooling recommend invalid paths even though production release gates were clean.
**Implementation**: Upgrade the existing cleanup inventory/verifier to schema v4 for the exact implementation stage, then schema v5 for the permanent steady-state guard; recognize only `server/src` and `studio-plugin/src` as local source zones; forbid root `src/` in static, runtime, generation, lint, and staged-file checks; retire the `@/` alias; index Studio Luau alongside backend TypeScript; generate deterministic tracked-path inventories; classify historical, negative-guard, Studio-relative, and Roblox-artifact-relative references; retain protected invariant evidence as a Merge Gate dependency without freezing future reviewed changes to the historical implementation diff.
**Preservation**: No deletion, dependency, lockfile, backend API, authentication, storage, generation output/API behavior, Studio protocol, Frontend identity, release topology, protected default, or rollback-reference change.
**Rollback**: Revert the focused CLEANUP-1D commit. CLEANUP-1C and all independently verified release artifacts remain intact.
**Status**: Complete. PR #42 merged as `f924079995059d9b86a5caaaf6364cb7b4879881`; pre-merge run #295 and post-merge run #296 passed, post-merge artifact `8679552100` has digest `sha256:a8fa2cea2192b4f69471926521678307a0409e3a053c699f5783fdbfb04aa14c`, and issue #41 is closed.

---

## 2026-07-28 — CLEANUP-1C Legacy Frontend Physical Removal

**Decision**: Execute the first deletion-authorized cleanup wave only after CLEANUP-1B was protected, verified, merged, and closed out. Reuse the single CLEANUP inventory and verifier; remove the exact classified embedded frontend surface and only direct packages already proven to have no active consumers.
**Exact baseline**: Protected default `release/cutover-1e-candidate` at post-CLEANUP-1B closeout commit `85a2fa8d512738e6d02ffae42da77af7a27db6fc`; CLEANUP-1B merge `703fe0fbcfcb8706506e9351af1fe7874a1337f0`; canonical standalone Frontend `kazakovak2001-lgtm/Frontend@1036c3ef9705d145cb9700cd14268a33d2abdd58`.
**Implementation**: Delete all 168 tracked root `src/` files, `index.html`, root TypeScript/Vite/Tailwind/PostCSS configuration, and the three broken archival combined-deployment files (`Dockerfile`, `deploy/docker-compose.yml`, and `deploy/nginx.conf`): 176 paths total. Remove five legacy-only runtime and seven legacy-only development direct package declarations, regenerate `package-lock.json`, retain `socket.io-client`, and make root `src/` a forbidden architecture root. The existing production-readiness audit now checks the canonical Studio plugin instead of the removed `src/shared` directory.
**Machine contract**: Schema v3 requires the exact baseline-relative `D`/`M`/`A` path and status set, historical SHA-256/size evidence for every deletion, no remaining repository consumer for any removed direct package, synchronized package/lockfile root maps, unchanged backend commands and Vitest scope, unchanged protected files, zero active-release legacy reference violations, and `legacy-frontend-audit` in the protected Merge Gate.
**Preservation**: The canonical backend, Studio plugin, standalone Frontend identity, active backend/composed deployment files, PostgreSQL-only root `docker-compose.yml`, CUTOVER evidence, promoted default, and pinned rollback reference are not modified. `_inventory_raw.txt` and `ProjectStructure.txt` remain for the explicit CLEANUP-1D inventory/documentation refresh.
**Verification**: A clean npm 10.9.8 install, local typecheck, architecture, boundaries, lint, formatting, 60 passing Vitest files / 666 passing tests, repository validation over 1,085 files, and backend build passed. A negative control proved that temporary reintroduction of root `src/` fails architecture validation as `forbidden-root`. Schema-v3 baseline-diff audit on the implementation tree passed with 188 exact changes, 176 removals, 12 pruned direct packages, synchronized package-lock root maps, and zero active-release legacy reference violations. PR #39 implementation head `600f17e8826da3a9d830760964b546d98674b75d` passed protected CI run `30329606556` (#289), Studio Plugin Package run #26, and Merge Gate. The first backend-image attempt encountered a transient Docker Hub timeout while pulling `docker/dockerfile:1`; retrying the exact job without a source change passed. Evidence artifact `8676923623`, named `cleanup-1c-physical-removal`, has digest `sha256:a6006b891305ccc9ac00fe662b5dbc8e4a9bce4fe731e18991eadfec28920b15`. Final PR head `3c977e756653f13e31ab622822639388f791e68f` passed CI run `30329991563` (#290), Studio Plugin Package run #27, and Merge Gate; evidence artifact `8677050249` has digest `sha256:e944bf32918b3aedf09ff591f0e76e56e62068d68710150f7b37fb3fc696d566`. PR #39 merged as `1bc54753783610827750dbb11689c0fb24620923`; post-merge push CI run `30330505927` (#291) passed the protected default-branch release, integrity, cleanup-audit, and Merge Gate sequence. Post-merge evidence artifact `8677218198` has digest `sha256:b7693a9fac74b6e6615b5ba277e98ccb8575d21147e381d9ebcb5e400c89f74f`. Issue #37 is closed as completed.
**Rollback**: Revert the focused CLEANUP-1C pull request to restore every deleted path and direct declaration from exact baseline `85a2fa8d512738e6d02ffae42da77af7a27db6fc`. Executable production rollback continues to use the independently verified CUTOVER-1A backend and CUTOVER-1B Frontend artifacts.
**Status**: Complete. CLEANUP-1D is now the next non-deletion post-removal verification stage.

---

## 2026-07-28 — CLEANUP-1B Legacy Frontend Tooling Decoupling

**Decision**: Remove the frozen root React/Vite frontend from active backend development, build, typecheck, test, and architecture-tooling paths before authorizing physical deletion. Reuse the CLEANUP-1A inventory/verifier, existing backend scripts, Vitest, domain firewall, CUTOVER release inventory, and protected Merge Gate; do not create parallel tooling.
**Baseline**: Protected default `release/cutover-1e-candidate` at CLEANUP-1A merge `99b0de4a3b493d1e1fa98173deea8fae59d57842`; canonical standalone Frontend `kazakovak2001-lgtm/Frontend` at release commit `1036c3ef9705d145cb9700cd14268a33d2abdd58`; frozen legacy source inventory 168 files.
**Implementation**: Root `dev`, `build`, `preview`, and `typecheck` now delegate to canonical backend operations. Existing Vitest receives an explicit backend-only config shared by normal and PostgreSQL acceptance runs, so it no longer loads root `vite.config.ts` or discovers frozen frontend tests. Architecture validation reports `server/src`, `studio-plugin/src`, and the external standalone Frontend as canonical while retaining backend cross-boundary and deprecated-runtime checks.
**Preservation**: The evolved cleanup verifier permits only the focused tooling/documentation file set and requires no change to root `src/`, legacy entry/config/deployment files, PostgreSQL-only compose, stale inventories, dependency declarations, `package-lock.json`, backend domain firewall, active release topology, or rollback references. `socket.io-client` remains retained for composed-release verification.
**Verification**: PR #35 implementation commit `12b2009f244caa77c8cfc21d9fd51c29afa519b1` passed protected CI run `30327076703` (#282): TypeScript, architecture, boundaries, lint, formatting, backend tests, PostgreSQL restart, backend image, composed HTTPS release, promoted baseline integrity, repository validation, CLEANUP-1B evidence, commitlint, Studio plugin packaging, and Merge Gate. Evidence artifact `8676095415`, named `cleanup-1b-tooling-decoupling`, has digest `sha256:dc455ca74bdd823584eabc0b2de55adf3efd9b472dc1084d958408e5b30745d6`. PR #35 merged as `703fe0fbcfcb8706506e9351af1fe7874a1337f0`; post-merge push CI run `30327587217` (#284) passed the default-branch release, rollback, cleanup-audit, and Merge Gate sequence. Post-merge evidence artifact `8676270323` has digest `sha256:5d14de17c49751392d009021dc9a7b14605447ae72d44e24414848d3331169ec`.
**Safety boundary**: `currentStageDeletionAuthorized=false`. CLEANUP-1C is the first deletion-authorized stage and remains blocked until CLEANUP-1B is verified and merged. PR #1 remains prohibited from direct merge.
**Rollback**: Revert the focused CLEANUP-1B pull request. CLEANUP-1A, active release artifacts, the protected default, the pinned rollback reference, and every legacy file/dependency remain available.
**Status**: Complete. CLEANUP-1C is now the next separately reviewed, deletion-authorized stage.

---

## 2026-07-27 — CUTOVER-1C Composed HTTPS Release

**Decision**: Compose the independently verified backend and standalone Frontend release artifacts behind one HTTPS origin. Reuse the existing Express API, Socket.IO server/client, cookie authentication, PostgreSQL storage, and Frontend adapters; do not introduce parallel transport or auth layers.
**Exact inputs**: Backend baseline `2bae4a1299e1094a5d3c3818adb158dbc1b26c77`; verified implementation head `8bee44a284244033d73637b3e3cc4bddf72af035`; exact Frontend release commit `1036c3ef9705d145cb9700cd14268a33d2abdd58`.
**Implementation**: `deploy/docker-compose.release.yml` composes PostgreSQL, backend, standalone Frontend, and an HTTPS Nginx proxy. HTTP and Socket.IO share one production-origin policy derived from `FRONTEND_URL`. Health checks use the Node runtime already present in both minimal images. The acceptance harness verifies secure host-only cookie attributes, authenticated REST, unauthenticated Socket.IO rejection, and authenticated polling-to-WebSocket upgrade.
**Verification**: CI run `30312627413` (#219) passed TypeScript, ESLint, Prettier, full tests, PostgreSQL restart E2E, backend image, repository validation, commitlint, Composed HTTPS Release, and Merge Gate. Evidence artifact `8670986116`, named `cutover-1c-composition-8bee44a284244033d73637b3e3cc4bddf72af035`, has digest `sha256:6a941900d9b73bca852d1fe071f148d6ac19eae151b414a9e7f99aa3ad39b57a`.
**Acceptance result**: Frontend health 200, backend health 200, SSR document 200, allowed CORS preflight 204, disallowed origin 403, authenticated `/api/platform/auth/me` 200, unauthenticated Socket.IO rejected, authenticated Socket.IO connected through polling and upgraded to WebSocket, and cookies remained `Secure`, `HttpOnly`, `SameSite=Lax`, and host-only.
**Rollback**: Revert focused PR #25. CUTOVER-1A and CUTOVER-1B remain independently deployable; the prior combined `Dockerfile`, `deploy/nginx.conf`, `deploy/docker-compose.yml`, and frozen root `src/` remain unchanged. No legacy dependency was pruned in this slice.
**Remaining gate**: Prepare release-baseline promotion, complete runtime dependency inventory, rehearse rollback, and remove the legacy frontend only in a separately reviewed cleanup change. Do not merge PR #1 directly.
**Status**: Verified; ready for focused PR merge.

---

## 2026-07-24 — CORE-1a Durable Project Boundary

**Decision**: Use one configured `StorageProvider` for server bootstrap, authentication, users, projects, generation history, and API keys; do not create route-local in-memory project state in production.
**Reason**: The previous project router instantiated its own `InMemoryStorageProvider`, so configured PostgreSQL persistence was bypassed. Authentication and user state also reset independently, making persistent project ownership unusable after restart.
**Implementation**: The server now runs migrations and hydrates storage before listening. `STORAGE_PROVIDER=postgres` requires `DATABASE_URL` and fails startup instead of quietly falling back to cache-only mode. Identity/session/user/project/history records use the configured provider, and shutdown flushes accepted writes. Project endpoints require an authenticated owner and accept only editable fields.
**Contract review**: The standalone frontend already sends credentials and normalizes `type`/`gameType` and `progress`/`qualityScore`, so no parallel adapter, page, or legacy frontend change was added. Anonymous project access and caller-supplied generation ownership were intentionally removed.
**Verification**: Clean Node.js 22 / npm 10 `npm run ci` passed with 62 test files / 709 tests. A live HTTP smoke flow verified owner creation/listing and 403/401 isolation behavior.
**Remaining gate**: CORE-1b must persist blueprints, executions, and chat, then prove PostgreSQL restart durability before Workspace work begins.
**Status**: Implemented; pending focused pull request review.

---

## 2026-07-24 — Portable CI Baseline

**Decision**: Use Node.js 22.12+ with npm 10+ as the supported runtime baseline, remove all tracked generated `node_modules/` files, and synchronize each repository lockfile before progressing to CORE-1.
**Reason**: GitHub Actions and clean checkouts failed at `npm ci` because both lockfiles were out of sync. The backend additionally committed platform-specific dependency artifacts, which made Linux checkouts non-portable and caused repository validation to scan dependencies.
**Implementation**: Added `.nvmrc` and package engine declarations, updated backend CI and Docker runtime to Node.js 22, refreshed both lockfiles with npm 10, formatted the inherited backend baseline, and removed 9,386 tracked dependency files while preserving `.gitignore` protection.
**Validation policy**: Security validation continues to block private keys, connection strings, GitHub/OpenAI-style credentials, and production-source credential literals. It now permits low-confidence credential vocabulary only in non-production documentation, test fixtures, and environment templates; this behavior is covered by dedicated validator tests.
**Verification**: Clean Node.js 22 / npm 10 `npm ci` and full backend `npm run ci` pass with 61 test files and 706 tests. Standalone frontend clean install, TypeScript check, and production build also pass.
**Status**: Merged and verified on the active integration branch. CORE-1 is unblocked.

---

## 2026-07-24 — Standalone Frontend Cutover

**Decision**: Make `kazakovak2001-lgtm/Frontend` the sole target web client for Roblox AI Studio. Freeze the embedded React/Vite application in this repository's root `src/` directory as a migration inventory; do not add new features or parallel integrations there.
**Reason**: Maintaining two active frontends would duplicate routes, services, API contracts, and Workspace behavior. The standalone frontend already owns the connected REST/Socket.IO adapter and must become the single presentation layer.
**Implementation direction**: Follow the ordered cutover sequence recorded in `FRONTEND_CUTOVER.md`: governance/CI, real persisted project data and contracts, workflow-oriented Workspace, Studio validation, then isolated legacy removal.
**Dependency discovered**: The repository tracks generated `node_modules/` content, so a Linux CI install changes platform-specific files and the repository validator scans dependencies. `CI-BASELINE-1` must be completed before CORE-1; it will be isolated because removing tracked generated files is a large destructive cleanup.
**Branch decision**: Treat `feature/plugin-merge` as the active integration baseline. Its large PR into `standing-pentaceratops` requires a dedicated release plan; do not mix routine work into that merge.
**Preservation**: Backend domains, API routes, Socket.IO events, and `studio-plugin/` remain the canonical implementation. Legacy frontend code is retained only until migration gates are proven.
**Status**: Active.

---

## 2026-07-16 — Autonomous Pipeline Real-Time Integration

**Decision**: Reuse existing PipelineEventEmitter + Socket.IO bridge for autonomous pipeline events. No parallel event system.  
**Reason**: The AutonomousOrchestrator executed 11 phases without emitting events, making workspace components (AgentBoard, PipelineStatusBar, CostMonitor) blind to autonomous progress. The existing event infrastructure already handled all needed event types.  
**Implementation**: Injected PipelineEventEmitter via constructor DI into AutonomousOrchestrator. Added emit calls in executePhases() for step.started/completed/failed and pipeline.started/completed/failed. Frontend: added step.failed subscription to usePipelineStream. AutonomousPipelinePanel uses Socket.IO as primary (via usePipelineStream isConnected) with HTTP polling as fallback.  
**Files modified**: AutonomousOrchestrator.ts, autonomous.ts (route), index.ts (1 line), usePipelineStream.ts, AutonomousPipelinePanel.tsx  
**Preservation**: Non-autonomous pipelines (GameGenerationService, PlanExecutor) unchanged. No new Socket.IO event names. No duplicate event system.  
**Status**: Complete.

---

## 2026-07-16 — Final Verification & Release Report (Task 11)

> **Superseded by DOC-201 (July 28, 2026):** The verification labels and
> combined-release files below describe the removed embedded product baseline.
> Current auth uses storage-backed opaque sessions, and current release evidence
> comes from the independent backend/Frontend images and protected INT-201 gate.

**Decision**: Complete final validation of all hardening tasks and generate release documentation (RELEASE_HARDENING_REPORT.md, V1_RELEASE_NOTES.md, SECURITY_FINAL_AUDIT.md, V1_RELEASE_CHECKLIST.md).  
**Reason**: All 10 implementation tasks are complete. Final verification confirms all security fixes work correctly and no regressions were introduced. The project needs formal release documentation before declaring production-ready.  
**Verification Results**:

- TypeScript compilation: ✅ Pass (0 errors)
- Vite production build: ✅ Pass (20.47s)
- Full test suite: 653/654 pass (1 pre-existing failure in ProductionAuditService unrelated to hardening)
- Bug condition exploration tests: 7/7 pass (all 8 bug categories resolved)
- Preservation property tests: 42/42 pass (no regressions)
- Security verification: bcrypt ✅, httpOnly cookies ✅, JWT validation ✅, Socket.IO auth ✅, public auth routes ✅, no localStorage tokens ✅
- Infrastructure verification: Dockerfile ✅, nginx.conf ✅, docker-compose.yml ✅, backup script ✅, migration runner ✅

**Files created**: `RELEASE_HARDENING_REPORT.md`, `V1_RELEASE_NOTES.md`, `docs/SECURITY_FINAL_AUDIT.md`, `docs/V1_RELEASE_CHECKLIST.md`  
**Files modified**: `docs/00-project-control/CURRENT_STATE.md`, `docs/00-project-control/ROADMAP_STATUS.md`, `docs/00-project-control/DECISION_LOG.md`  
**Release Readiness Score**: 9/10  
**Status**: Complete. Project is READY for production release.

---

## 2026-07-16 — Production Infrastructure (Task 10)

> **Superseded by DOC-201 (July 28, 2026):** The root `Dockerfile`,
> `deploy/nginx.conf`, and `deploy/docker-compose.yml` described below were part
> of the removed, non-executable embedded stack. Current deployment uses
> `Dockerfile.backend`, the standalone Frontend image,
> `deploy/docker-compose.release.yml`, and `deploy/release/nginx.conf`.

**Decision**: Add production deployment infrastructure including Dockerfile, automatic migration runner, nginx reverse proxy, database backup script, and Docker Compose orchestration.  
**Reason**: The project had no containerization, no automated schema management, no reverse proxy configuration, and no backup strategy. These are required for production deployment (Bug 1.8).  
**Implementation**:

- Multi-stage Dockerfile (Node.js 20 alpine builder → minimal production image with non-root user)
- Migration runner (`migrationRunner.ts`) with `schema_migrations` tracking table, transactional migration application, invoked on server startup
- Nginx reverse proxy config with WebSocket upgrade support for Socket.IO, gzip compression, security headers, and SPA fallback
- Docker Compose stack (app + postgres + nginx) for local production-like testing
- Database backup shell script with configurable retention policy
- Production deployment guide documentation

**Files created**: `Dockerfile`, `.dockerignore`, `deploy/nginx.conf`, `deploy/docker-compose.yml`, `scripts/backup-database.sh`, `server/src/platform/storage/postgres/migrationRunner.ts`, `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`  
**Files modified**: `server/src/index.ts` (import migration runner on startup), `.env.example` (production variables section), `docs/00-project-control/CURRENT_STATE.md`, `docs/00-project-control/ROADMAP_STATUS.md`, `docs/00-project-control/DECISION_LOG.md`  
**Preservation**: STORAGE_PROVIDER=inmemory continues to function without PostgreSQL. Migration runner skips entirely when not using postgres. No application behavior changes.  
**Status**: Complete.

---

## 2026-07-16 — Documentation Synchronization (Task 9)

**Decision**: Correct all stale claims in CURRENT_STATE.md, ROADMAP_STATUS.md, and DECISION_LOG.md to accurately reflect the current implementation state.  
**Reason**: Reality audit (July 15) identified 3 stale documentation claims: Analytics listed as "Hardcoded page" (actually connected since F-1), Lua Gen listed as "Not connected to AI Studio" (connected since F-2), and incorrect page/component/service counts. Documentation must be the Single Source of Truth for operators and developers.  
**Key corrections**:

- Analytics status: "Hardcoded page" → "Connected (analyticsApi, AnalyticsPage)"
- Lua Gen / AI Studio status: "Not connected to AI Studio" → "Connected (aiEngine, AiStudioPage)"
- Page count: 11 → 12 routed pages (11 page files + WorkspacePage)
- Component count: 55 → 69 .tsx component files
- Services: 16 frontend service files confirmed
- Backend routes: 28 registered endpoint groups confirmed
- All completed security hardening tasks (1-8) documented
- Removed obsolete "Next Recommended Task" section (all features complete)
- Added Feature Completion Status table
- Added Security Hardening Status table
  **Files modified**: `docs/00-project-control/CURRENT_STATE.md`, `docs/00-project-control/ROADMAP_STATUS.md`, `docs/00-project-control/DECISION_LOG.md`  
  **Verification**: Documentation-only change — no code modifications, no build impact.  
  **Status**: Complete.

---

## 2026-07-16 — Dead Code Removal (Task 8)

**Decision**: Remove all confirmed dead code from the codebase and merge studioService into studioBridgeApi.  
**Reason**: Reality audit identified 5 dead files, 1 orphan route, and 1 unused constant. `studioService.ts` called non-existent `/api/v1/studio` routes — the correct endpoint (`/api/studio`) is already served by `studioBridgeApi.ts`. Removing dead code reduces bundle size, eliminates confusion, and simplifies maintenance.  
**Files removed**: `src/pages/AiEngineDemoPage.tsx`, `src/hooks/index.ts`, `src/hooks/useSocket.ts`, `src/utils/cn.ts`, `src/types/index.ts`, `src/services/studioService.ts`  
**Files modified**: `src/services/studioBridgeApi.ts` (merged StudioSession, SyncResult, getProjectStudioStatus, syncToStudio), `src/app/router/index.tsx` (removed /ai-engine route), `src/shared/constants/index.ts` (removed navItems), `src/features/workspace/components/StudioBridgePanel.tsx`, `StudioConnectionStatus.tsx`, `SyncButton.tsx` (updated imports to studioBridgeApi)  
**Verification**: `tsc --noEmit` ✅, `vite build` ✅, `vitest run` 652/654 pass (2 pre-existing failures unrelated to dead code removal)  
**Preservation**: All existing routes render correctly. No functionality lost — AiEngineDemoPage was unrouted, hooks were unused, cn.ts was unreferenced, types were unreferenced. Studio functionality preserved via studioBridgeApi with correct base path.  
**Status**: Complete.

---

## 2026-07-16 — Socket.IO JWT Handshake Validation Implemented (Task 7)

> **Superseded by DOC-201 (July 28, 2026):** The heading and
> “cryptographic validation” wording below were inaccurate. The retained
> security change rejects arbitrary credentials, but current production
> Socket.IO authenticates a random opaque access credential by resolving its
> server-side session record.

**Decision**: Replace token-presence-only Socket.IO auth with full cryptographic validation via `AuthService.validateToken()`.  
**Reason**: The Socket.IO middleware only checked `if (!token)` — any non-empty string was accepted as a valid token in production mode. This allowed unauthenticated clients to establish persistent WebSocket connections and receive real-time events.  
**Implementation**: Updated `io.use()` middleware in `server/src/index.ts` to import the shared `authService` singleton and call `authService.validateToken(token)` for all production connections. Invalid/expired tokens are rejected with `next(new Error("Invalid or expired token"))`. Authenticated session data is attached to `socket.data.user`.  
**Affected systems**: `server/src/index.ts` (Socket.IO middleware)  
**Preservation**: Development mode bypass unchanged (all connections accepted without validation). Socket.IO event contracts unchanged. Frontend connection code unchanged (already sends tokens).  
**Status**: Complete.

---

## 2026-07-16 — JWT Cryptographic Validation Implemented (Task 6)

> **Superseded by DOC-201 (July 28, 2026):** No signed-token verification was
> introduced. The retained decision records the move from presence-only checks
> to storage-backed opaque-session lookup in `AuthService.validateToken()`.

**Decision**: Replace presence-only Bearer token check in `authMiddleware` with full cryptographic validation via `AuthService.validateToken()`.  
**Reason**: The `authMiddleware` only checked `authHeader?.startsWith("Bearer ")` — any arbitrary string passed authentication in production. This allowed unauthenticated access to all protected resources.  
**Implementation**: Created a shared `authService` singleton (`platform/auth/authServiceInstance.ts`) imported by both the security middleware and platform router. The middleware now extracts the token, validates it cryptographically, attaches the session to the request, and returns 401 for invalid/expired tokens. Cookie-based auth also validates tokens.  
**Affected systems**: `server/src/common/middleware/security.ts`, `server/src/platform/auth/authServiceInstance.ts`, `server/src/routes/platform.ts`  
**Preservation**: Development mode bypass unchanged. API key auth unchanged. Public routes unchanged. Valid tokens continue to grant access.  
**Status**: Complete.

---

## 2026-07-16 — httpOnly Cookie Token Delivery (Task 5)

> **Superseded by DOC-201 (July 28, 2026):** The current production policy is
> `Secure`, `HttpOnly`, `SameSite=Lax`, host-only. The access cookie path is `/`
> and the refresh cookie path is `/api/platform/auth/refresh`; browser auth
> response bodies are credential-free after SEC-201.

**Decision**: Move auth tokens from localStorage to httpOnly, Secure, SameSite=Strict cookies.  
**Reason**: Storing tokens in localStorage exposes them to any XSS attack vector on the page. httpOnly cookies are inaccessible to JavaScript, eliminating this attack surface entirely.  
**Implementation**: Server sets tokens as httpOnly cookies on login/register. Frontend removed all `localStorage.setItem()` calls for tokens. `authMiddleware` reads tokens from cookies in addition to Authorization header. Frontend uses `credentials: 'include'` on all fetch calls.  
**Affected systems**: `server/src/common/middleware/security.ts`, `src/services/authApi.ts`, `src/app/providers/AuthContext.tsx`  
**Preservation**: Auth flow continues to work. Frontend API calls unchanged. Session restoration via cookie-authenticated `/api/platform/auth/me` call.  
**Status**: Complete.

---

## 2026-07-16 — bcrypt Password Hashing (Task 4)

**Decision**: Replace SHA-256 password hashing with bcrypt (cost factor 12).  
**Reason**: SHA-256 is unsalted, fast, and trivially reversible via rainbow tables. bcrypt provides per-hash salts and configurable cost factor making brute-force attacks computationally expensive.  
**Implementation**: Installed `bcryptjs`. Replaced `createHash("sha256")` in `AuthService.hash()` with `bcrypt.hash(password, 12)`. Updated `login()` to use `bcrypt.compare()`. Added transparent upgrade path for existing SHA-256 hashes.  
**Affected systems**: `server/src/platform/auth/AuthService.ts`  
**Preservation**: Valid credentials continue to authenticate. Development mode unchanged.  
**Status**: Complete.

---

## 2026-07-16 — Auth Route PUBLIC_PREFIXES Fix (Task 3)

**Decision**: Add `/api/platform/auth` to the `PUBLIC_PREFIXES` array in `security.ts`.  
**Reason**: Login, register, and refresh routes were blocked by authMiddleware in production mode because only `/api/platform/users` was whitelisted. Users could not authenticate at all in production.  
**Implementation**: Added `"/api/platform/auth"` to `PUBLIC_PREFIXES` array. One-line fix.  
**Affected systems**: `server/src/common/middleware/security.ts`  
**Preservation**: Development mode bypass unchanged. All other route protection unchanged.  
**Status**: Complete.

---

## 2026-07-15 — Final v1.0 Reality Audit Results

**Decision**: Fix auth middleware PUBLIC_PREFIXES immediately (5min production blocker). Defer dead code cleanup to post-release.  
**Reason**: Reality audit found `/api/platform/auth/login` and `/api/platform/auth/register` are NOT whitelisted in `authMiddleware`. In production mode, nobody can authenticate. This is a 1-line fix that must happen before any deployment.  
**Key findings**: 14 total discrepancies — 1 critical bug, 4 dead code items, 3 stale doc claims, 3 duplicate implementations, 3 undocumented systems.  
**Affected systems**: security.ts (blocker), studioService.ts (broken), AiEngineDemoPage (dead), docs (stale).  
**Status**: Audit complete. All fixes now implemented (Tasks 3-9).

---

## 2026-07-15 — Security Release Audit Decision

**Decision**: Execute Phase 1 security hardening (H-1 through H-4, ~4.5h) before any public deployment. Safe for controlled beta/demo in current state.  
**Reason**: Authentication works functionally but uses cryptographic shortcuts (SHA-256 passwords, token presence-only validation, localStorage storage). These are acceptable for development/demo but create exploitable vectors on public internet.  
**Key findings**: 5 critical items, 5 medium items, 4 acceptable-for-now items. Total hardening budget: ~12h across 3 phases.  
**Affected systems**: AuthService, security middleware, authApi (frontend), Socket.IO auth.  
**Status**: Audit complete. All critical security hardening implemented.

---

## 2026-07-15 — Documentation Architecture System

**Decision**: Introduce docs/00-project-control/ as the Single Source of Truth for project state.  
**Reason**: Project reached size where audit documents were being overwritten, losing history. AI agents lose long-term context without a persistent knowledge system.  
**Affected systems**: Documentation structure, AI agent workflow.  
**Status**: Implemented

---

## 2026-07-15 — Product Roadmap Phase 1 Priority

**Decision**: Start UX-4 with F-1 (Analytics Real Data) as first feature.  
**Reason**: Lowest risk (pure data display), backend /api/analytics already exists, establishes pattern for connecting other demo pages.  
**Affected systems**: AnalyticsPage, new analyticsApi service.  
**Status**: ✅ Complete

---

## 2026-07-15 — Responsive Layout as Bugfix (UX-4.1)

**Decision**: Treat responsive layout issues as a bugfix, not a new feature.  
**Reason**: Layout should already work responsively per Design System spec. It's a defect in the existing implementation.  
**Affected systems**: AppShell, Sidebar, TopBar, Workspace layout, all pages.  
**Status**: ✅ Resolved (already implemented)

---

## 2026-07-15 — UX-3D Migration Closure

**Decision**: Close UX-3D migration with 2 remaining debt items (test coverage, JSDoc).  
**Reason**: Both items can be addressed incrementally alongside feature development. Blocking on 80% test coverage would delay product development indefinitely.  
**Affected systems**: All (governance rule change).  
**Status**: Implemented

---

## 2026-07-15 — Path Alias Strategy (@/)

**Decision**: Use single @/ alias mapping to src/ for all cross-directory imports. Intra-feature imports remain relative.  
**Reason**: Simplest config (one alias), works with both TypeScript and Vite, covers all subdirectories. Relative imports within a feature are acceptable and more readable for local references.  
**Affected systems**: tsconfig.json, vite.config.ts, all source files.  
**Status**: Implemented

---

## 2026-07-15 — Design Token Enforcement

**Decision**: Replace all raw Tailwind status colors (green-_, red-_, yellow-_) with semantic tokens (success-_, error-_, warning-_).  
**Reason**: Design System requires semantic meaning. Raw colors don't communicate intent. Tokens are already defined in tailwind.config.js.  
**Affected systems**: 18 source files (shared/ui, pages, workspace components).  
**Status**: Implemented

---

## 2026-07-15 — AppShell as Single Layout Wrapper

**Decision**: Use AppShell as the only layout component. Remove AppLayout and all legacy alternatives.  
**Reason**: Eliminate duplicate layouts. Single source of truth for app chrome (sidebar, topbar, statusbar).  
**Affected systems**: Frontend routing, all pages, Sidebar, TopBar.  
**Status**: Implemented (Sprint 1)

---

## 2026-07-13 — shared/ui as Canonical Component Library

**Decision**: All reusable UI components must live in src/shared/ui/. Legacy src/components/ui/ deleted.  
**Reason**: Single component library, consistent design system, no duplication.  
**Affected systems**: All pages and features importing UI components.  
**Status**: Implemented (Sprint 2)

---

## 2026-07-13 — InMemory Storage (Development Default with PostgreSQL Available)

**Decision**: Keep InMemoryBlueprintRepository as fallback storage. PostgreSQL available as primary when configured.  
**Reason**: Development phase — allows running without external database. PostgreSQL implemented as F-11 for production use.  
**Affected systems**: Backend data layer, storage provider selection.  
**Status**: ✅ Complete (F-11 implemented PostgreSQL with InMemory fallback)
