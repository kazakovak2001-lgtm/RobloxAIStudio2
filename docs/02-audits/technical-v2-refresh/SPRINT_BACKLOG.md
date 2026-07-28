# Technical Audit v2.0 Refresh — Sprint Backlog

**Backend baseline:** `2ecb3997eb6fab5074c438f10dedcc1715381e11`  
**Frontend baseline:** `739b43cbc5f991c1852e80b30fe38c0e7c02d681`

## Sprint 1 — ARCH-2B: Truthful architecture firewall

### ARCH-201 — Reconcile subsystem manifest

- Inventory every real `server/src` subsystem.
- Add every subsystem to the manifest or an explicit exclusion list.
- Remove stale paths and obsolete quarantine references.
- Add a test that fails when a new top-level subsystem is unclassified.

### ARCH-202 — Replace regex dependency extraction

- Parse TypeScript with AST.
- Capture imports, side-effect imports, dynamic imports, `require`, `export ... from`, and `export * from`.
- Generate deterministic dependency inventory.

### ARCH-203 — Enforce layers and unknown domains

- Evaluate `layers.*.canImportFrom`.
- Fail unknown internal source/target domains.
- Add allowed and forbidden edge tests for each layer.

### ARCH-204 — Align cycle and process status

- Define cycle policy and temporary exceptions.
- Make JSON report, console summary and process exit code identical.
- Add negative CI controls.

**Exit gate:** architecture report is `PASS`, CI is green, and a deliberately forbidden edge fails.

## Sprint 2 — FRONTEND-2C: Protected quality baseline

### FE-202 — Mechanical format baseline

- Apply Prettier in an isolated reviewable PR.
- Confirm no behavioral changes.

### FE-203 — Resolve ESLint findings

- Fix all non-format errors and warnings intentionally.
- Set zero-warning policy.

### FE-204 — Protect lint and format

- Add `format:check`.
- Add protected lint and format jobs.
- Keep typecheck, build, SSR, responsive QA, native tests and 40-check contract green.

### FE-205 — Bundle budget

- Replace wildcard Lucide imports with direct typed imports.
- Add client and SSR size budgets.
- Upload bundle evidence.

### FE-206 — Expand frontend behavior tests

- REST parsing and error states.
- Auth mutation/logout/refresh behavior.
- Workspace route rendering.
- Socket reconnect and stale event handling.
- Studio verification pending/verified/failed states.

**Exit gate:** zero lint errors/warnings, zero format drift, bundle within budget, all existing gates green.

## Sprint 3 — RUNTIME-2D: Runtime ownership consolidation

### RT-201 — Publish runtime ownership matrix

Classify execution, providers, prompts, context, memory, collaboration and Studio stacks as canonical, bounded adapter, preview, deprecated or removed.

### RT-202 — Bound PlanExecutor and Pipeline v2

- Define non-overlapping responsibilities.
- Align event, retry, artifact and persistence contracts.
- Prevent new direct consumers outside approved boundaries.

### RT-203 — Autonomous disposition

Choose one:

- relabel `/api/autonomous` and UI as preview simulation; or
- connect every retained phase to canonical services and real artifacts.

### RT-204 — Retire disconnected composition roots

- Decide `PlatformIntegrationManager`, alternate provider registry, runtime controller, top-level collaboration, `ui-gen`, `lua`, and isolated validator.
- Add deprecation import bans and migration notes.

### RT-205 — Resolve parallel contract

- Implement deterministic bounded DAG parallelism; or
- remove `ExecutionOptions.parallel` and parallel claims.

**Exit gate:** one documented execution path for each product use case; no silently disconnected production-looking stack.

## Sprint 4 — DURABILITY-2E: Durable acknowledgement

### DATA-201 — Awaitable storage mutation API

- Introduce awaited set/delete or transaction boundary.
- Preserve in-memory provider compatibility.

### DATA-202 — Route/repository migration

- Return success only after required persistence.
- Define retry and conflict behavior.

### DATA-203 — Failure evidence

- PostgreSQL write rejection tests.
- No phantom success.
- No partial ownership state.
- Restart verification.

### DATA-204 — Operational state inventory

Classify concepts, plans, simulations, autonomous sessions, traces, metrics, preferences, versions, queues and Studio maps as cache, telemetry, preview or durable product state.

### DATA-205 — Migrate and bound

- Persist durable product state.
- Add TTL/size limits for cache and telemetry.
- Document preview state loss semantics.

**Exit gate:** durable API success implies confirmed persistence; every process-local store has an owner and lifecycle.

## Sprint 5 — SECURITY-2G: Enforcement and automation

### SEC-202 — Security policy

- Define production/dev dependency thresholds.
- Add expiring exception register.

### SEC-203 — Automated scanning

- PR production dependency audit.
- Scheduled full dependency audit.
- SAST/CodeQL-equivalent.
- Secret scanning.
- Container image scan.
- SBOM artifact.

### SEC-204 — RBAC decision

- Identify privileged operations.
- Mount permission middleware and negative tests, or remove unsupported production RBAC claims.
- Preserve ownership checks.

### SEC-205 — Security evidence

Attach exact tool versions, findings and exceptions to protected Merge Gate artifacts.

**Exit gate:** security regressions are automatically detected and authorization claims match mounted behavior.

## Sprint 6 — DOC-202: Documentation authority

- Banner superseded audits and obsolete architecture maps.
- Remove unsupported manual health scores.
- Generate inventories from scripts.
- Link current project-control documents to this refresh.
- Preserve historical evidence without presenting it as current truth.

## Sprint 7 — STUDIO-2F: Optional native Roblox delivery

Start only after previous gates remain green.

- Native model/mesh/audio/image materialization.
- Generated ScreenGui/control construction.
- Canonical runtime validator.
- `.rbxl`/place publication decision.
- Desktop acceptance and exact evidence for every retained capability.

## Deferred backlog

- Collaborative development/F-12.
- Marketplace and extension ecosystem expansion.
- Cloud distributed execution beyond bounded operational needs.
- Additional orchestration engines.
- Enterprise SSO/team features.

These remain deferred because they multiply runtime, authorization, durability and governance complexity before the current contracts are closed.
