# Technical Audit v2.0 — Sprint Backlog

**Prepared:** July 28, 2026  
**Source:** [Technical Audit issue #38](https://github.com/kazakovak2001-lgtm/RobloxAIStudio2/issues/38)

## Backlog rules

- Preserve the standalone Frontend as the only web client.
- Preserve `PlanExecutor` as the canonical generation core unless an ADR explicitly replaces it.
- Preserve the shared Studio command ledger and exact receipt verification.
- Do not combine mechanical formatting, architecture rewrites, and product behavior in one pull request.
- Every cross-repository item records exact backend and Frontend SHAs.
- Sizes are relative: `S` focused, `M` multi-file, `L` architectural, `XL` multi-sprint.

## Sprint 2A — Release correctness

These items are ready and should run in this order.

### SEC-201 — Cookie-only browser auth contract

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P0              |
| Repository | RobloxAIStudio2 |
| Size       | M               |
| Depends on | TECH-AUDIT-2    |

**Scope**

- Remove `token` and `refreshToken` from register/login/refresh JSON.
- Keep httpOnly cookie auth, logout, Socket.IO cookie auth, and API-key clients.
- Store refresh credentials as digests and rotate them atomically.
- Correct JWT terminology in active docs/types/comments without rewriting historical evidence.

**Acceptance**

- Production login/register/refresh tests assert body credentials are absent.
- Frontend auth flow and `/auth/me` pass.
- Production REST and Socket.IO auth pass.
- Stolen/old refresh token fails after rotation.
- `npm run ci` and composed release pass.

### FE-201 — Real Studio verification in Workspace

| Field      | Value        |
| ---------- | ------------ |
| Priority   | P0           |
| Repository | Frontend     |
| Size       | S            |
| Depends on | TECH-AUDIT-2 |

**Scope**

- Extend Studio response types with `artifactVerified`, `verificationStatus`, verified execution/count, and error.
- Derive `studioArtifactVerified` from parsed data instead of literal false.
- Render pending/verified/failed readiness accurately.

**Acceptance**

- Native tests cover verified, pending, failed, malformed, and disconnected responses.
- A backend-verified session no longer produces the “pending STUDIO-1 verification” blocker.
- TypeScript, workspace tests, build, responsive QA, and integration checks pass.

### INT-201 — Protected 40-check production contract

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P0              |
| Repository | Both            |
| Size       | M               |
| Depends on | SEC-201, FE-201 |

**Scope**

- Run Frontend `scripts/e2e-backend.mjs` against a production-mode backend in protected CI.
- Record exact backend/Frontend SHAs and the 40 check results.
- Document that development mode intentionally bypasses auth and is not valid isolation evidence.

**Acceptance**

- Auth, cross-user REST, cross-user realtime, generation, modules, and guarded Studio sync pass.
- Failed contract check blocks merge/release.
- Artifact identifies both commits and runtime configuration.
- Existing backend and Frontend Merge Gates remain green.

### DOC-201 — Correct active auth and release terminology

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P1              |
| Repository | RobloxAIStudio2 |
| Size       | S               |
| Depends on | SEC-201         |

**Scope**

- Replace active “JWT validation” claims with “storage-backed opaque session validation.”
- Record actual SameSite policy.
- Link current security claims to executable tests.
- Leave historical decision text intact or annotate it as superseded.

**Acceptance**

- No current-state document claims signed JWT behavior.
- Search-based doc check prevents reintroduction in authoritative files.

## Sprint 2B — Architecture firewall

### ARCH-201 — TypeScript AST import graph

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P0              |
| Repository | RobloxAIStudio2 |
| Size       | L               |
| Depends on | INT-201         |

**Scope**

- Replace regex extraction with TypeScript AST traversal.
- Cover static/type/side-effect imports, re-exports, dynamic imports, and `require`.
- Preserve production/test/quarantine scope rules.

**Acceptance**

- Fixtures prove every syntax form is detected.
- Current scan reports all 1,446 baseline import-like specifications or a reviewed explained delta.
- Re-export boundary violation fails CI.

### ARCH-202 — Exhaustive manifest and layer enforcement

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P0              |
| Repository | RobloxAIStudio2 |
| Size       | M               |
| Depends on | ARCH-201        |

**Scope**

- Model all 46 real subsystems.
- Remove stale `engine` and obsolete quarantine declarations.
- Validate manifest paths.
- Enforce `canImportFrom`.
- Fail internal unknown domains.

**Acceptance**

- Zero unmodeled subsystem directories.
- Missing/stale manifest path test fails.
- Every layer has allowed and forbidden fixtures.
- No internal edge is silently skipped as unknown.

### ARCH-203 — Cycle policy and truthful exit semantics

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P0              |
| Repository | RobloxAIStudio2 |
| Size       | M/L             |
| Depends on | ARCH-202        |

**Scope**

- Analyze the four baseline cycles.
- Break them through interfaces where practical.
- If a temporary allowlist is necessary, assign owner, reason, and expiry.
- Make JSON status, console result, and process exit agree.

**Acceptance**

- A non-allowlisted cycle fails CI.
- Allowed cycles appear as explicit debt, not `PASS`.
- Script header/comments match behavior.
- Merge Gate consumes the result.

### ARCH-204 — Runtime ownership ADR

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P1              |
| Repository | RobloxAIStudio2 |
| Size       | S               |
| Depends on | ARCH-202        |

**Scope**

Classify each execution, provider, agent registry, memory, collaboration, analytics, and Studio stack as:

- canonical;
- bounded adapter;
- preview;
- deprecated;
- removal candidate.

**Acceptance**

- ADR names construction roots and permitted consumers.
- Boundary rules prevent new imports into deprecated/isolated stacks.
- `PlatformIntegrationManager` receives an explicit adopt/retire decision.

## Sprint 2C — Frontend quality and performance

### FE-202 — Mechanical format baseline

| Field      | Value    |
| ---------- | -------- |
| Priority   | P1       |
| Repository | Frontend |
| Size       | M        |
| Depends on | FE-201   |

**Scope**

- Apply Prettier to the 70 failing files in a behavior-free commit.
- Add `format:check`.

**Acceptance**

- Zero format differences.
- Diff is mechanical and separate from warning fixes.
- TypeScript, tests, and build unchanged.

### FE-203 — Resolve ESLint warnings and protect lint

| Field      | Value    |
| ---------- | -------- |
| Priority   | P1       |
| Repository | Frontend |
| Size       | M        |
| Depends on | FE-202   |

**Scope**

- Resolve all remaining hooks and fast-refresh warnings intentionally.
- Run ESLint with zero warnings in CI.

**Acceptance**

- `npm run lint` exits zero with no warning allowance.
- CI has required lint and format jobs.
- No rule is globally disabled solely to make the baseline green.

### FE-204 — Bundle budget and Lucide import fix

| Field      | Value    |
| ---------- | -------- |
| Priority   | P2       |
| Repository | Frontend |
| Size       | S        |
| Depends on | FE-202   |

**Scope**

- Replace `import * as Icons` with direct imports or a typed allowlist.
- Add client and SSR bundle thresholds.
- Evaluate removal of `vite-tsconfig-paths`.

**Acceptance**

- `AgentCard` no longer includes the full Lucide namespace.
- The 593.85 kB warning source is removed.
- Budget regression fails CI with an actionable message.

### FE-205 — Expand native adapter/read-model tests

| Field      | Value          |
| ---------- | -------------- |
| Priority   | P2             |
| Repository | Frontend       |
| Size       | M              |
| Depends on | FE-201, FE-203 |

**Scope**

- Test auth refresh behavior, response normalization, Studio parsing, degraded sources, and realtime reconnection decisions.

**Acceptance**

- Tests exercise service/read-model code, not only pure workspace decisions.
- Malformed backend data fails safely and visibly.

## Sprint 2D — Runtime consolidation

### RUN-201 — Autonomous API truthfulness

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P1              |
| Repository | RobloxAIStudio2 |
| Size       | L               |
| Depends on | ARCH-204        |

**Scope**

Choose:

- preview relabeling with deterministic simulation; or
- real phase adapters to canonical generation, playtest, repair, and Studio services.

**Acceptance for real mode**

- No random quality score or fixed-delay placeholder output.
- Every completed event maps to a real output/artifact.
- Failed/resumed execution has deterministic state.
- Production E2E inspects artifacts, not only statuses.

### RUN-202 — Provider stack consolidation

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P1              |
| Repository | RobloxAIStudio2 |
| Size       | L               |
| Depends on | ARCH-204        |

**Scope**

- Keep one production provider interface/factory.
- Reuse health/retry/normalization utilities where valuable.
- Remove or quarantine stub integration adapters.

**Acceptance**

- One environment variable contract.
- No alternate provider registry constructed outside tests.
- Provider fallback/retry tests cover the canonical path.

### RUN-203 — Agent/collaboration stack disposition

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P2              |
| Repository | RobloxAIStudio2 |
| Size       | L               |
| Depends on | ARCH-204        |

**Scope**

- Keep one production AgentRegistry.
- Decide ownership for `agents/orchestrator`, `agents/collaboration`, and top-level `collaboration`.
- Remove “LLM consensus” claims while reasoning is deterministic/stubbed.

**Acceptance**

- Mounted routes use documented canonical packages.
- Isolated stacks have no production imports.
- F-12 remains blocked until route-level RBAC and durability exist.

### RUN-204 — Memory ownership and durability

| Field      | Value              |
| ---------- | ------------------ |
| Priority   | P2                 |
| Repository | RobloxAIStudio2    |
| Size       | L                  |
| Depends on | ARCH-204, DATA-201 |

**Scope**

- Define durable project/agent memory versus ephemeral prompt context.
- Consolidate `ai/memory`, `memory/core`, and `memory/knowledge`.

**Acceptance**

- One API/storage contract for durable memory.
- Tenant/project isolation and restart tests.
- Bounded context and retention behavior.

### RUN-205 — Parallel execution decision

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P2              |
| Repository | RobloxAIStudio2 |
| Size       | M/L             |
| Depends on | ARCH-204        |

**Scope**

- Benchmark real DAG workloads.
- Implement bounded deterministic parallelism or remove the unused option.

**Acceptance**

- Public types/docs match behavior.
- If implemented: event, retry, cancellation, memory, and artifact ordering tests pass.

## Sprint 2E — Durability and operations

### DATA-201 — Awaitable durable mutations

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P1              |
| Repository | RobloxAIStudio2 |
| Size       | L               |
| Depends on | ARCH-204        |

**Scope**

- Add an awaited mutation/transaction boundary to storage and repositories.
- Propagate persistence failure to HTTP responses.

**Acceptance**

- Database rejection cannot produce a successful durable mutation response.
- Cache remains consistent after failure.
- Restart and ownership tests remain green.

### DATA-202 — Operational state classification

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P2              |
| Repository | RobloxAIStudio2 |
| Size       | M               |
| Depends on | ARCH-204        |

**Scope**

Inventory concepts, plans, simulations, autonomous sessions, traces, metrics, preferences, versions, queues, Studio maps, and caches.

**Acceptance**

- Every store is labeled cache, telemetry, preview, or durable.
- Cache/telemetry have bounds/retention.
- Durable candidates have follow-up migration items.

### DATA-203 — Persist selected product state

| Field      | Value              |
| ---------- | ------------------ |
| Priority   | P2                 |
| Repository | RobloxAIStudio2    |
| Size       | XL                 |
| Depends on | DATA-201, DATA-202 |

**Acceptance**

- Selected product workflows resume after restart.
- No partial tenant crossover.
- Health status reports persistence degradation.

## Cross-cutting security and dependency backlog

### SEC-202 — Route-level RBAC

| Field      | Value             |
| ---------- | ----------------- |
| Priority   | P1                |
| Repository | RobloxAIStudio2   |
| Size       | M                 |
| Depends on | SEC-201, ARCH-204 |

**Acceptance**

- Privileged route matrix exists.
- Lower roles receive 403 in production tests.
- Project ownership remains mandatory.

### SEC-203 — Dependency, source, and image policy

| Field      | Value   |
| ---------- | ------- |
| Priority   | P1      |
| Repository | Both    |
| Size       | M       |
| Depends on | INT-201 |

**Acceptance**

- Production dependency policy blocks unapproved high/critical advisories.
- Development exceptions have owner and expiry.
- SAST, SBOM, and image scan artifacts are generated.
- Current advisories are triaged without blind major upgrades.

### DEPS-201 — Low-risk dependency hygiene

| Field      | Value  |
| ---------- | ------ |
| Priority   | P3     |
| Repository | Both   |
| Size       | S      |
| Depends on | FE-203 |

**Scope**

- Remove obsolete `@types/socket.io-client` if clean.
- Remove redundant `vite-tsconfig-paths` if clean.
- Plan, do not opportunistically force, Recharts migration.

**Acceptance**

- Clean install, TypeScript, tests, build, and relevant bundle checks pass.

### DEPS-202 — Plain Node compiled backend

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P3              |
| Repository | RobloxAIStudio2 |
| Size       | L               |
| Depends on | ARCH-2B         |

**Acceptance**

- Compiled ESM starts with `node dist/server/index.js`.
- Production image removes `tsx`.
- Existing release health and composed tests pass.

## Studio expansion backlog

### STUDIO-201 — Explicit excluded-source inventory

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P3              |
| Repository | RobloxAIStudio2 |
| Size       | S               |
| Depends on | ARCH-204        |

**Acceptance**

- All five excluded Lua sources are clearly migration inventory or deferred experiments.
- README and package allowlist agree.
- Package SHA determinism and contract tests pass.

### STUDIO-202 — Native artifact contract design

| Field      | Value             |
| ---------- | ----------------- |
| Priority   | P3                |
| Repository | RobloxAIStudio2   |
| Size       | M                 |
| Depends on | DATA-201, RUN-204 |

**Scope**

Define schemas, ownership, permissions, rollback, and receipts for models, meshes, textures, audio, animations, and GUI.

**Acceptance**

- ADR extends the existing command ledger.
- Metadata receipt and native materialization are distinct states.
- Threat/content-permission review is complete.

### STUDIO-203 — Native assets/GUI/place implementation

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P3              |
| Repository | RobloxAIStudio2 |
| Size       | XL              |
| Depends on | STUDIO-202      |

**Acceptance**

- Native instances are created/updated idempotently.
- Runtime validation is active and reports exact evidence.
- Failure rolls back or marks partial state explicitly.
- A new real Studio desktop run verifies package SHA, Explorer hierarchy, receipts, and backend state.

## Documentation backlog

### DOC-202 — Historical authority banners and generated metrics

| Field      | Value           |
| ---------- | --------------- |
| Priority   | P2              |
| Repository | RobloxAIStudio2 |
| Size       | M               |
| Depends on | ARCH-202        |

**Acceptance**

- Authority-sounding stale audits are marked superseded.
- Current file/module/test counts come from a repeatable script/report.
- Manual architecture/debt health scores are removed.
- Broken links and current-state references pass validation.

## Deferred

| Item                                  | Reason                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| F-12 collaborative development        | Requires route-level RBAC, durable shared state, and consolidated collaboration architecture |
| OAuth/JWT migration                   | Not required to fix the current opaque-session response leak                                 |
| New Frontend framework/design rewrite | Current standalone Frontend ownership and SSR release are established                        |
| Studio protocol rewrite               | Existing command/receipt contract is verified and extensible                                 |
| New execution engine                  | Consolidation must reduce, not add, runtime paths                                            |
