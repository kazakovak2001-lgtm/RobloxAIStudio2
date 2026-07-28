# Technical Audit v2.0 — Roadmap Update

**Effective date:** July 28, 2026  
**Supersedes:** “TECH-AUDIT-2 next” and the assumption that every historical F-1–F-11 completion label equals current production completeness.

## Roadmap decision

The cutover and cleanup sequence remains complete. The next work is not a new feature wave. It is a correctness and consolidation sequence derived from executable evidence.

```text
TECH-AUDIT-2
    ↓
HARDEN-2A
    ↓
ARCH-2B
    ↓
FRONTEND-2C
    ↓
RUNTIME-2D
    ↓
DURABILITY-2E
    ↓
STUDIO-2F
    ↓
F-12 re-evaluation
```

No phase may create a second web client, Studio protocol, production composition root, or canonical generation engine.

## Ordered delivery plan

| Order | Phase         | Objective                                                                           | Entry dependency             | Exit gate                                                                                                             |
| ----: | ------------- | ----------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
|     0 | TECH-AUDIT-2  | Establish the first evidence-based two-repository architecture baseline             | CUTOVER-1 + CLEANUP complete | Seven audit deliverables reviewed; project-control docs point to them                                                 |
|     1 | HARDEN-2A     | Close immediate credential and cross-repository correctness gaps                    | TECH-AUDIT-2                 | No credentials in browser JSON; Frontend shows real Studio verification; protected 40-check production contract suite |
|     2 | ARCH-2B       | Make architecture enforcement exhaustive and truthful                               | HARDEN-2A                    | All 46 subsystems classified; AST gate; unknown domains rejected; report/exit/cycle policy agree                      |
|     3 | FRONTEND-2C   | Establish a clean quality and performance baseline                                  | HARDEN-2A                    | Zero lint warnings/errors, format gate, bundle budget, existing SSR/responsive/E2E gates green                        |
|     4 | RUNTIME-2D    | Consolidate execution, provider, orchestration, collaboration, and memory ownership | ARCH-2B                      | Every overlapping stack has a disposition; autonomous API is real or explicitly preview; no new deprecated consumers  |
|     5 | DURABILITY-2E | Align product-state claims with request-level persistence and restart recovery      | RUNTIME-2D                   | Awaited durable mutations; failure semantics; classified/migrated operational stores; restart tests                   |
|     6 | STUDIO-2F     | Extend the verified Studio path to native assets/GUI/place scope, if still desired  | DURABILITY-2E                | Native-instance contract, exact receipts, runtime validation, and real desktop evidence                               |
|     7 | F-12 decision | Decide whether collaborative development is still the highest-value expansion       | All prior gates              | Architecture/durability review and an explicit ADR                                                                    |

## Phase 0 — TECH-AUDIT-2

### Delivered

- repository and module registry across backend, Frontend, and Studio plugin;
- implementation feature matrix;
- architecture/specification gap report;
- prioritized technical debt register;
- updated delivery sequence;
- implementable sprint backlog;
- corrected project-control baseline.

### Baseline

- Backend: `a2f596dcb03d92791f96d1b217bf33a534eeddcb`
- Frontend: `1036c3ef9705d145cb9700cd14268a33d2abdd58`
- Backend tests: 672 pass, one skip
- Frontend native tests: seven pass
- Cross-repository production integration: 40 checks pass

## Phase 1 — HARDEN-2A

**Progress:** Complete. SEC-201 merged through backend PR #46, FE-201 through
Frontend PR #14, and reciprocal INT-201 protection through Frontend PR #16 plus
backend PR #48. DOC-201 issue #49 / PR #50 synchronized the active auth/release
guides, marked conflicting historical decisions as superseded, and protected
the terminology through the native auth-contract test. ARCH-2B is active.

### Scope

1. **SEC-2A-1 — Cookie-only browser auth responses**
   - Remove access/refresh tokens from register/login/refresh JSON.
   - Preserve httpOnly cookie, CLI/API-key, logout, and Socket behavior.
   - Protect refresh-token storage/rotation.

2. **CONTRACT-2A-1 — Studio verification in the canonical Frontend**
   - Parse `artifactVerified` and `verificationStatus`.
   - Render pending/verified/failed states.
   - Remove the permanent false blocker.

3. **CONTRACT-2A-2 — Protected production-mode integration**
   - Run the existing 40-check suite with `NODE_ENV=production`.
   - Record exact backend and Frontend SHAs.
   - Gate release promotion on the result.

4. **AUTH-2A-2 — Accurate auth contract**
   - Replace JWT language with opaque session-token language.
   - Decide and test the SameSite policy actually used.
   - State that RBAC is not active until ARCH/RUNTIME work mounts it.

### Non-goals

- no OAuth rewrite;
- no new token format solely to match old JWT wording;
- no new Frontend transport;
- no Studio protocol v2.

### Exit evidence

- backend and Frontend unit/contract tests;
- production auth and cross-user isolation;
- verified Studio status visible in Frontend;
- response bodies proven credential-free;
- both repository SHAs captured in CI artifact.

## Phase 2 — ARCH-2B

**Progress:** ARCH-201 is implemented under issue #51. TypeScript AST traversal
now covers the reviewed 547-file / 1,460-specification graph, including
re-exports and import-type queries, with native syntax/scope/violation fixtures.
ARCH-202 is next; manifest and layer completeness plus cycle/exit semantics
remain open by design.

### Scope

1. Replace regex import parsing with TypeScript AST traversal.
2. Model all 46 backend subsystem directories.
3. Remove stale manifest entries and require path existence.
4. Enforce declared layer directions.
5. Fail on internal unknown domains.
6. Reconcile the four current cycles through:
   - dependency inversion;
   - an explicit temporary allowlist with owner and expiry; or
   - a documented non-failing policy reflected consistently in JSON/CLI/CI.
7. Add manifest drift and negative boundary tests.

### Exit evidence

- zero unclassified internal source/target domains;
- re-export fixtures caught;
- every layer has positive and negative fixtures;
- report status and exit code agree;
- baseline cycle disposition recorded;
- protected Merge Gate consumes the corrected result.

## Phase 3 — FRONTEND-2C

### Scope

1. Format the 70-file baseline in a mechanical commit.
2. Resolve the 12 non-format ESLint warnings intentionally.
3. Protect lint and `format:check`.
4. Replace wildcard Lucide import with a typed direct-import map.
5. Add client/SSR bundle budgets.
6. Remove `vite-tsconfig-paths` only after clean TypeScript/build evidence.
7. Expand service/read-model tests for auth and Studio response parsing.

### Exit evidence

- zero lint warnings/errors;
- zero format differences;
- no client chunk above the agreed budget without an explicit exception;
- TypeScript, seven existing logic tests, new contract tests, build, SSR image, responsive QA, and production integration all pass.

## Phase 4 — RUNTIME-2D

### Ownership decisions

| Concern               | Required result                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Execution             | `PlanExecutor` stays core; Pipeline v2 receives a bounded artifact/review role or is folded in; runtime-controller disposition documented |
| Autonomous            | Real canonical service calls and durable checkpoints, or explicit preview naming                                                          |
| Providers             | One production provider interface/factory; useful retry/health abstractions reused behind it                                              |
| Agents                | One production registry; alternate metadata/orchestration registries become adapters or are retired                                       |
| Memory                | One durable memory contract plus clearly ephemeral prompt/session context                                                                 |
| Collaboration         | Mounted `agents/collaboration` ownership documented; isolated stacks retired or adopted                                                   |
| Deprecated integrator | Preserved constants/types migrated, then file removed                                                                                     |

### Parallel execution decision

Implement bounded deterministic DAG parallelism only if performance evidence justifies it. Otherwise remove the unused `parallel` option and claims.

### Exit evidence

- one ownership diagram/table checked by architecture tests;
- no production import of deprecated/isolated stacks;
- autonomous lifecycle evidence matches actual engines;
- retry, failure, cancellation, event, memory, and artifact semantics are consistent across retained entrypoints.

## Phase 5 — DURABILITY-2E

### Scope

1. Add awaitable storage mutation/transaction semantics.
2. Return HTTP success only after required persistence succeeds.
3. Specify cache/database reconciliation after write failure.
4. Classify each active Map/store:
   - bounded cache;
   - ephemeral telemetry;
   - preview-only state;
   - durable product state.
5. Persist selected concepts/plans/autonomous sessions/operational state only where product behavior requires it.
6. Add restart, abrupt-failure, and partial-write tests.

### Exit evidence

- request-level durability tests;
- no undocumented durable product state in process-only maps;
- bounded telemetry/cache growth;
- production health exposes degraded persistence accurately;
- project ownership and existing restart evidence remain green.

## Phase 6 — STUDIO-2F

This phase is optional product expansion, not closure work for STUDIO-1.

### Candidate scope

- native Model/MeshPart/Decal/Image/Sound/Animation insertion;
- generated ScreenGui/control materialization;
- runtime validation after import;
- optional `.rbxl`/place publish boundary;
- content permission, ownership, and rollback behavior.

### Mandatory constraints

- reuse the existing project-scoped command ledger;
- extend the exact artifact receipt schema instead of adding another protocol;
- distinguish metadata receipt from native instance creation;
- package only explicitly active Lua sources;
- require a new real Roblox Studio desktop acceptance run.

## F-12 re-evaluation gate

Collaborative development remains deferred. Before starting it, confirm:

- corrected architecture gate is green;
- runtime ownership is consolidated;
- product state durability is explicit;
- authorization is mounted for team operations;
- collaboration requirements exceed what project history/realtime already provide;
- an ADR defines tenant isolation, roles, conflict resolution, presence, and durable event history.

## Roadmap metrics

Roadmap status must use executable gates instead of manual health scores:

| Metric              | Source                                          |
| ------------------- | ----------------------------------------------- |
| Build/type safety   | Repository CI                                   |
| Test result         | Test runner JSON/console                        |
| Architecture status | Corrected boundary report                       |
| Contract status     | Exact-SHA production integration artifact       |
| Frontend quality    | Protected lint/format/bundle gates              |
| Dependency risk     | Policy-based audit/SAST/image reports           |
| Durability          | Restart and write-failure E2E                   |
| Studio acceptance   | Package SHA + exact receipts + desktop evidence |

The corresponding work items are ready in [SPRINT_BACKLOG.md](./SPRINT_BACKLOG.md).
