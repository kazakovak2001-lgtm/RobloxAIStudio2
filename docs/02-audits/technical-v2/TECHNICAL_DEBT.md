# Technical Audit v2.0 — Technical Debt Register

**Audit date:** July 28, 2026  
**Backend baseline:** `a2f596dcb03d92791f96d1b217bf33a534eeddcb`  
**Frontend baseline:** `1036c3ef9705d145cb9700cd14268a33d2abdd58`

## Priority model

| Priority | Meaning                                                              |
| -------- | -------------------------------------------------------------------- |
| P0       | Release/security correctness; execute before broader product work.   |
| P1       | Architecture, contract, or quality gate that can hide regressions.   |
| P2       | Maintainability, performance, or durability improvement after P0/P1. |
| P3       | Cleanup or optional capability with bounded current impact.          |

## Register

| ID       | Priority | Area                | Debt                                                                                                           | Primary repository |
| -------- | -------- | ------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| TAV2-001 | P0       | Security            | Browser auth responses expose reusable access and refresh tokens despite httpOnly cookies                      | Backend            |
| TAV2-002 | P0       | Contract/UI         | Frontend hardcodes Studio artifact verification to false                                                       | Frontend           |
| TAV2-003 | P0       | Architecture gate   | Boundary report can be `FAIL` while CI exits successfully; manifest and parser are incomplete                  | Backend            |
| TAV2-004 | P1       | AI/runtime          | Mounted autonomous pipeline simulates engine phases                                                            | Backend            |
| TAV2-005 | P1       | Frontend quality    | 640 lint errors, 12 warnings, and 70 unformatted files are outside protected CI                                | Frontend           |
| TAV2-006 | P1       | Durability          | HTTP success can precede asynchronous PostgreSQL write success                                                 | Backend            |
| TAV2-007 | P1       | Integration         | Passing 40-check production contract suite is not protected cross-repository evidence                          | Both               |
| TAV2-008 | P1       | Runtime ownership   | Multiple execution, orchestration, provider, collaboration, and memory stacks lack final disposition           | Backend            |
| TAV2-009 | P1       | Security automation | No protected dependency/SAST/image/SBOM policy; current advisories are manually known only                     | Both               |
| TAV2-010 | P1       | Authorization       | Roles/permissions are defined and tested but not mounted on privileged routes                                  | Backend            |
| TAV2-011 | P2       | Execution           | `ExecutionOptions.parallel` is exposed but ignored                                                             | Backend            |
| TAV2-012 | P2       | Performance         | Wildcard Lucide import produces a 593.85 kB client chunk; no bundle budget                                     | Frontend           |
| TAV2-013 | P2       | State ownership     | Active operational and route state remains process-local without an explicit ephemeral/durable classification  | Backend            |
| TAV2-014 | P2       | Documentation       | 335 Markdown files include stale counts, unsupported health scores, and inaccurate JWT/SameSite claims         | Backend            |
| TAV2-015 | P3       | Studio scope        | Five excluded plugin sources are not consistently labeled; native assets/GUI/runtime validation are incomplete | Backend/plugin     |
| TAV2-016 | P3       | Dependency/runtime  | Obsolete/redundant packages and the compiled-server `tsx` loader remain                                        | Both               |

**Resolution tracking:** TAV2-001 is implemented by HARDEN-2A / SEC-201 under
backend issue #45. TAV2-002 is implemented by FE-201 under Frontend issue #13
and PR #14. TAV2-007 is implemented by Frontend PR #16 and backend issue
#47 / PR #48. DOC-201 issue #49 corrects the active auth/release subset of
TAV2-014; the broader historical authority/metrics consolidation remains
DOC-202 scope. ARCH-201 issue #51 resolves the parser/re-export portion of
TAV2-003; ARCH-202 and ARCH-203 retain the manifest, layer, unknown-domain,
cycle, and exit-semantics portions. The evidence below remains the immutable
TECH-AUDIT-2 baseline; current project state is tracked in
[`CURRENT_STATE.md`](../../00-project-control/CURRENT_STATE.md).

## Detailed remediation contracts

### TAV2-001 — Remove reusable credentials from browser JSON

**Evidence**

- `setAuthCookies()` writes httpOnly access and refresh cookies.
- register, login, and refresh responses also return `token` and `refreshToken` in `data`.
- current standalone Frontend uses cookie credentials and does not need body tokens.

**Risk**

The body fields weaken the stated XSS protection because browser JavaScript can receive reusable credentials, especially from the refresh endpoint.

**Definition of done**

- Browser register/login/refresh response schemas contain user/session metadata but no reusable credential.
- Cookie behavior, CLI/Studio API-key behavior, logout, and Socket.IO authentication remain working.
- Refresh tokens are stored as digests or otherwise protected at rest and rotate atomically.
- Production integration tests assert that credential-shaped fields are absent.
- Documentation says “opaque storage-backed session token,” not JWT.

### TAV2-002 — Parse real Studio verification in the Frontend

**Evidence**

- Backend project Studio status returns `artifactVerified`, `verificationStatus`, verified execution/artifact data, and errors.
- `WorkspaceReadiness.studioArtifactVerified` is the literal type `false` and the read model always assigns false.

**Risk**

The canonical UI reports a permanent blocker after a successful, backend-verified desktop import.

**Definition of done**

- Frontend Studio status types include the backend verification fields.
- `studioArtifactVerified` derives from validated response data.
- Workspace blocker/stage logic covers idle, queued, delivered, acknowledged, verified, and failed.
- Service parsing and route behavior have native tests.
- The 40-check production integration suite retains its guarded Studio behavior.

### TAV2-003 — Make the architecture gate truthful and exhaustive

**Evidence**

- 46 real subsystem directories versus 32 manifest domains.
- 15 real modules unmodeled and stale `engine` modeled.
- TypeScript AST sees 1,446 import-like specs; regex validator sees 1,208 and misses 252 re-exports.
- Four cycles set report status to `FAIL`, while the script returns zero.
- `layers.*.canImportFrom` is not evaluated; unknown internal domains are skipped.

**Resolution progress**

ARCH-201 replaces the regex parser with TypeScript AST traversal. Its reviewed
post-implementation baseline contains 1,460 specifications across the same 547
production files: the original 1,446, 12 pre-existing import-type query nodes,
and two lazy-loader specifications. Re-export and scope fixtures are protected.
Manifest/layer/unknown-domain completeness and truthful cycle/exit policy remain
open under ARCH-202 and ARCH-203.

**Risk**

CI can certify architecture claims without observing large parts of the dependency graph.

**Definition of done**

- Manifest validates every real subsystem and rejects stale paths.
- AST parser covers import/re-export forms.
- Internal unknown domains fail.
- Layer rules are enforced with positive/negative tests.
- Cycle policy and temporary exceptions are explicit.
- JSON status, console summary, and exit code always agree.

### TAV2-004 — Replace or relabel simulated autonomous execution

**Evidence**

`AutonomousOrchestrator.executePhase()` waits fixed durations and returns simulated outputs; playtest score is random. The API is mounted and historic roadmap calls it complete.

**Risk**

Users and downstream code can interpret lifecycle events as evidence that real design, Lua, asset, assembly, playtest, repair, and Studio operations ran.

**Definition of done**

Choose one:

1. relabel endpoints/UI/docs as preview simulation and remove production-complete claims; or
2. call canonical services for every retained phase, persist checkpoints, resume safely after restart, and pass an end-to-end test that inspects real artifacts.

No second event protocol or execution engine may be introduced.

### TAV2-005 — Establish a protected Frontend quality baseline

**Evidence**

- `npm run lint`: 640 errors and 12 warnings; 640 are Prettier-fixable.
- Prettier check: 70 files fail.
- Frontend CI has no lint or format job.

**Risk**

Formatting masks real lint warnings, and future code can regress without a gate despite green CI.

**Definition of done**

- Apply a reviewable mechanical formatting baseline.
- Resolve all non-format ESLint warnings intentionally.
- Add `format:check` and protected lint jobs with zero warnings.
- Preserve TypeScript, build, native tests, responsive QA, and integration behavior.

### TAV2-006 — Define request-level durability acknowledgement

**Evidence**

`PostgresStorageProvider.set/delete` mutate cache and schedule writes without returning an awaitable result. Persistence failures occur after repository methods return.

**Risk**

A successful mutation response can be lost on database failure or abrupt process termination.

**Definition of done**

- Durable mutations expose an awaited transaction/write boundary.
- Routes return success only after required persistence succeeds.
- Cache and database failure/retry/reconciliation behavior is specified.
- Tests cover write rejection, process restart, and no partial ownership state.
- Ephemeral telemetry remains allowed when explicitly classified.

### TAV2-007 — Protect the cross-repository production contract

**Evidence**

All 40 checks in Frontend `scripts/e2e-backend.mjs` pass with `NODE_ENV=production`, including auth and cross-user REST/realtime isolation. The script is not run by either protected CI. Backend composed CI manually pins one Frontend SHA.

**Risk**

Either repository can merge a response/event contract change without running the most representative shared suite.

**Definition of done**

- One protected workflow runs the suite with an exact backend/Frontend SHA pair.
- The workflow starts the backend in production mode and documents why.
- Artifact evidence records both SHAs and results.
- Release promotion requires the shared contract result.
- Schema/contract drift is validated at adapter boundaries.

### TAV2-008 — Consolidate runtime ownership

**Evidence**

- Primary `PlanExecutor`, Pipeline v2, simulated autonomous, integration runtime controller, and deprecated integrator coexist.
- Canonical and alternate provider registries coexist.
- Three memory systems and multiple orchestration/collaboration packages coexist.
- `PlatformIntegrationManager` has no production caller.

**Risk**

Features can be added to an inactive stack or obtain different retry, persistence, event, and artifact semantics depending on endpoint.

**Definition of done**

- Publish one ownership map for execution, providers, prompts, memory, collaboration, and Studio.
- Every stack is classified canonical, bounded adapter, preview, deprecated, or removed.
- No “integration” composition root remains silently disconnected.
- Import boundaries prevent new consumers of deprecated/isolated stacks.

### TAV2-009 — Add security and dependency automation

**Evidence**

- No dependency audit, SAST, dependency review, image scan, or SBOM gate in either CI.
- Backend: three low production and 20 high development advisories.
- Frontend: zero production and five high development advisories.

**Risk**

Advisory changes are detected only during manual audits; automated major upgrades could also break tooling.

**Definition of done**

- Define severity/scope policy, approved exceptions, and expiry dates.
- Run production dependency audit on every PR and scheduled full-graph audit.
- Add source and image scanning plus SBOM artifacts.
- Triage advisories without forced unsafe major-version changes.

### TAV2-010 — Mount or retire RBAC

**Evidence**

Role hierarchy, permission tables, and `PermissionMiddleware` are covered only by unit tests. Production routes use authentication and ownership but no role/permission middleware.

**Risk**

Documentation and types imply authorization capabilities that are not enforced.

**Definition of done**

- Identify genuinely privileged operations.
- Mount permission checks and add lower-role negative tests, or remove unsupported RBAC claims/types.
- Keep project ownership as the mandatory tenant boundary.

### TAV2-011 — Resolve the parallel execution contract

**Evidence**

`ExecutionOptions.parallel` is public, while `PlanExecutor` explicitly iterates ready nodes sequentially.

**Definition of done**

- Either implement bounded parallel DAG execution with deterministic events, cancellation, retry, memory, and artifact ordering tests; or remove the option and parallel claims.

### TAV2-012 — Add bundle budgets and direct icon imports

**Evidence**

`AgentCard.tsx` imports `* as Icons` from `lucide-react`, although callers currently provide `Bot`. Vite reports a 593.85 kB client chunk (148.66 kB gzip) and an approximately 1.14 MB raw SSR Lucide module.

**Definition of done**

- Use a typed allowlist/direct icon imports.
- Add client and SSR bundle budgets to CI.
- Remove redundant `vite-tsconfig-paths` if Vite native support is sufficient.

### TAV2-013 — Classify and migrate process-local state

**Evidence**

Active routes/services keep concepts, plans, simulation results, autonomous sessions, traces, metrics, preferences, versions, queues, and other operational records in Maps.

**Definition of done**

- Inventory each store as cache, telemetry, preview, or durable product state.
- Add eviction/bounds for cache/telemetry.
- Persist and restart-test durable product state.
- User-facing documentation distinguishes previews from durable features.

### TAV2-014 — Consolidate current documentation

**Evidence**

335 Markdown files include obsolete module maps, a deleted frontend, stale counts, unsupported health scores, JWT terminology, and a SameSite Strict claim while code uses Lax.

**Definition of done**

- TECH-AUDIT-2 and project-control docs remain authoritative.
- Authority-sounding historical reports carry superseded banners.
- Generated inventories replace manual counts where practical.
- Unsupported scores are removed or tied to an executable formula.

### TAV2-015 — Clarify Studio source and product scope

**Evidence**

The canonical package includes nine of 14 Lua sources. Four are migration inventory; `RuntimeValidator` is deferred. Non-Lua artifacts become metadata rather than native assets.

**Definition of done**

- Rename/move or explicitly document every excluded source.
- Preserve allowlist/package tests.
- Treat real asset/GUI/place/runtime validation as separate roadmap items with desktop evidence.

### TAV2-016 — Dependency and ESM runtime hygiene

**Evidence**

- Backend retains `@types/socket.io-client@1.x` beside `socket.io-client@4.x`, which ships types.
- Frontend retains `vite-tsconfig-paths` despite Vite’s native tsconfig path support.
- `recharts@2.15.4` is deprecated/inactive according to install metadata.
- Compiled backend ESM still needs the production `tsx` loader for extensionless imports.

**Definition of done**

- Remove packages only after clean install/typecheck/build evidence.
- Modernize compiled ESM imports so plain `node dist/server/index.js` works.
- Evaluate chart-library migration separately from security upgrades.

## Debt explicitly closed

The following are not open debt in TECH-AUDIT-2:

- embedded frontend physical removal;
- canonical standalone Frontend ownership;
- backend/Frontend independent release images;
- PostgreSQL pre-listen migrations/hydration;
- production authentication presence/validation;
- cookie-only browser responses and digest-only refresh rotation;
- reciprocal protected 40-check production contract evidence;
- project ownership isolation;
- canonical generation artifact recording;
- Studio command acknowledgement/result ordering;
- exact artifact identity/hash verification;
- deterministic Studio plugin package;
- real desktop STUDIO-1 acceptance evidence.

Those completed boundaries must be preserved by every remediation item.
