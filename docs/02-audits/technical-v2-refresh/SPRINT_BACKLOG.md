# Technical Audit v2.0 Refresh — Sprint Backlog

**Backend release baseline:** `a22d060b7fa44607c97a30d60b633e5545f8cfdb`  
**Frontend contract baseline:** `95824451a92a9cdfe331dbc678bbe98467b53021`  
**Pending, excluded from baseline:** backend PR #107 at `83d6b08ac15f67ac6e836bffb38506e3b32c45ab`

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

### ARCH-204 — Fail closed and align process status

- Treat missing or parse-invalid `architecture.manifest.json` as a production-critical failure.
- Make `RuntimeBoundaryGuard.validate()` return a failing result when enforcement cannot run.
- Define cycle policy and temporary exceptions.
- Make JSON report, console summary and process exit code identical.
- Add negative CI controls.

**Exit gate:** architecture report is `PASS`, CI is green, and missing/invalid manifests plus a deliberately forbidden edge both fail with a non-zero exit.

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

### DATA-201 — Canonical durable mutation boundary — substantially implemented

- Production storage success must acknowledge a committed durable write, not merely completion of an awaited method.
- Keep in-memory storage only as a test/preview compatibility provider for this gate.
- Preserve one canonical single-record and atomic-batch API.
- Keep PostgreSQL statements transaction-affine and publish cache changes only after COMMIT.

### DATA-202 — Route/repository migration — in progress

Landed in the current release baseline:

- project creation and duplication;
- blueprint deletion cascades;
- chat message creation and conversation deletion;
- generation-history writes and pre-start pipeline reservation.

Remaining:

- land auth/storage convergence PR #107;
- inventory every remaining direct durable consumer;
- remove, migrate or explicitly classify compatibility paths;
- define uniform retry and conflict behavior.

### DATA-203 — Failure evidence — implemented for landed slices

- PostgreSQL write rejection tests.
- No phantom success.
- No partial ownership state.
- Rollback and queue-recovery tests.
- Restart verification.
- Post-removal invariant evidence.

### DATA-204 — Operational state inventory — open

Classify concepts, plans, simulations, autonomous sessions, traces, metrics, preferences, versions, queues and Studio maps as cache, telemetry, preview or durable product state.

### DATA-205 — Migrate and bound — open

- Persist durable product state.
- Add TTL/size limits for cache and telemetry.
- Document preview state loss semantics.
- Define reconciliation behavior for failed or conflicting writes.

**Exit gate:** every production API success implies an acknowledged committed durable write; in-memory storage is not accepted as production durability evidence; every process-local store has an owner and lifecycle.

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

This sprint follows the core architecture/runtime/durability/security decisions and precedes optional Studio product-scope expansion.

- Banner superseded audits and obsolete architecture maps.
- Remove unsupported manual health scores.
- Generate inventories from scripts.
- Link current project-control documents to this refresh.
- Preserve historical evidence without presenting it as current truth.

**Exit gate:** one linked authority chain identifies the current roadmap, audit, backlog and executable evidence.

## Sprint 7 — STUDIO-2F: Optional native Roblox delivery

Start only after the preceding control and documentation gates remain green.

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
