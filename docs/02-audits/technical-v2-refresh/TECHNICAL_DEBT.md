# Technical Audit v2.0 Refresh — Technical Debt Register

**Backend release baseline:** `a22d060b7fa44607c97a30d60b633e5545f8cfdb`  
**Frontend contract baseline:** `95824451a92a9cdfe331dbc678bbe98467b53021`  
**Pending, excluded from baseline:** backend PR #107 at `83d6b08ac15f67ac6e836bffb38506e3b32c45ab`

## Priority model

- **P0:** release, security or architecture correctness.
- **P1:** runtime, contract or quality gap that can hide regressions.
- **P2:** durability, maintainability or performance.
- **P3:** bounded cleanup or optional capability.

## Register

| ID | Priority | Area | Status | Debt / action |
|---|---|---|---|---|
| TAV2-001 | P0 | Authentication | Closed | Cookie-only browser response contract implemented and tested |
| TAV2-002 | P0 | Frontend/Studio | Closed | Real Studio verification parsed and rendered |
| TAV2-003 | P0 | Architecture | Open | Manifest/parser/unknown-domain/layer/cycle/exit semantics incomplete; missing/invalid manifests do not fail closed |
| TAV2-004 | P1 | Autonomous runtime | Open | Mounted autonomous phases simulate work |
| TAV2-005 | P1 | Frontend quality | Open | Establish zero-error lint/format and protected gates |
| TAV2-006 | P1 | Durability | Partial | Major project/blueprint/chat/history paths acknowledge persistence; auth/storage convergence and residual consumers remain |
| TAV2-007 | P1 | Cross-repo contract | Closed | Exact 40-check production contract protected in both repos |
| TAV2-008 | P1 | Runtime ownership | Open | Multiple execution/provider/memory/orchestration stacks overlap |
| TAV2-009 | P1 | Security automation | Open | Dependency, SAST, secret, image and SBOM policy incomplete |
| TAV2-010 | P1 | Authorization | Open | RBAC definitions exist but are not mounted on routes |
| TAV2-011 | P2 | Execution | Open | Public parallel option is not implemented |
| TAV2-012 | P2 | Frontend performance | Open | Bundle hotspot and no budgets |
| TAV2-013 | P2 | State ownership | Open | Process-local state lacks cache/telemetry/preview/durable classification |
| TAV2-014 | P2 | Documentation | Partial | Active terminology and current baselines corrected; broader authority consolidation remains |
| TAV2-015 | P3 | Studio scope | Open | Native assets/GUI/place/runtime validation incomplete |
| TAV2-016 | P3 | Dependency/runtime | Open | Package and compiled ESM hygiene remain |

## Definitions of done

### TAV2-003 — Architecture gate

- Exhaustive manifest.
- Missing or parse-invalid manifests fail `RuntimeBoundaryGuard.validate()`.
- AST import/re-export inventory.
- Unknown internal domains fail.
- Layer rules enforced.
- Explicit cycle policy.
- Report, console and exit status agree.
- CI negative controls.

### TAV2-004 — Autonomous runtime

Choose one bounded outcome:

1. rename/document as preview simulation; or
2. invoke canonical services for every retained phase, persist checkpoints and pass artifact-inspecting E2E recovery tests.

No new orchestration engine is allowed.

### TAV2-005 — Frontend quality

- Mechanical formatting baseline reviewed separately.
- All non-format lint findings resolved intentionally.
- `lint` and `format:check` protected with zero warnings.
- TypeScript, production build, native tests, responsive QA and 40-check contract remain green.
- Add client and SSR bundle budgets.

### TAV2-006 — Durability acknowledgement

Landed evidence:

- durable repository mutations and atomic batches are awaitable;
- project creation/duplication, blueprint deletion, chat creation/deletion and generation-history/pipeline reservation wait for acknowledgement;
- rollback, rejection and restart tests prove no partial state for those paths.

Remaining definition of done:

- production success follows an acknowledged COMMIT;
- in-memory providers are test/preview-only durability evidence;
- auth/storage convergence PR #107 is landed or superseded by equivalent verified behavior;
- every remaining direct durable consumer is migrated or classified;
- cache/database failure, retry and reconciliation semantics are documented.

### TAV2-008 — Runtime ownership

- Publish one ownership map for execution, providers, prompts, memory, collaboration and Studio.
- Classify each stack as canonical, adapter, preview, deprecated or removed.
- Unbootstrapped composition roots receive explicit disposition.
- Import boundaries prevent new consumers of deprecated stacks.

### TAV2-009 — Security automation

- Severity and scope policy with expiring exceptions.
- Production dependency audit on PRs.
- Scheduled full-graph audit.
- Source/SAST and secret scanning.
- Image scan and SBOM artifact.
- Advisory triage without unsafe automatic major upgrades.

### TAV2-010 — Authorization

- Identify privileged operations.
- Mount permission checks and lower-role negative tests, or remove unsupported RBAC claims.
- Preserve project ownership as mandatory tenant isolation.

### TAV2-011 — Parallel contract

Implement deterministic bounded DAG parallelism with cancellation/retry/event/artifact ordering, or remove the public option and all parallel claims.

### TAV2-012 — Bundle performance

- Replace wildcard icon imports with direct typed allowlist.
- Add client and SSR budgets.
- Track regressions in CI.

### TAV2-013 — State classification

Inventory every active store as:

- cache;
- ephemeral telemetry;
- preview/session state;
- durable product state.

Bound/evict caches, persist durable state and restart-test it.

### TAV2-014 — Documentation governance

- Current audit and project-control docs remain authoritative.
- Historical authority-looking reports get superseded banners.
- Generated inventories replace manual counts.
- Aggregate health percentages are removed or use a documented executable formula.
- Roadmap and sprint backlog define one delivery order.

### TAV2-015 — Studio product scope

- Every excluded Lua source explicitly labeled.
- Package allowlist remains protected.
- Native models/assets, generated GUI, runtime validation and place publication tracked as separate desktop-evidenced capabilities.

### TAV2-016 — Runtime hygiene

- Remove redundant packages only after clean install/typecheck/build evidence.
- Decide compiled ESM import strategy so production does not rely on accidental loader behavior.
- Track framework deprecations and supported Node/npm versions.
