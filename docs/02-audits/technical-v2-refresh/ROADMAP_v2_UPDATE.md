# Technical Audit v2.0 Refresh — Roadmap Update

**Backend release baseline:** `a22d060b7fa44607c97a30d60b633e5545f8cfdb`  
**Frontend contract baseline:** `95824451a92a9cdfe331dbc678bbe98467b53021`  
**Pending, excluded from baseline:** backend PR #107 at `83d6b08ac15f67ac6e836bffb38506e3b32c45ab`

## Current state

Completed:

- independent backend/frontend release topology;
- durable project/blueprint/history core;
- standalone Workspace;
- desktop-verified Studio artifact delivery;
- legacy embedded frontend removal and invariant guard;
- TECH-AUDIT-2 baseline;
- HARDEN-2A browser auth, Studio-state and cross-repository contract corrections;
- acknowledged project creation/duplication, blueprint deletion, chat creation/deletion, and generation-history/pipeline reservation;
- protected rollback, restart and post-removal invariant evidence for the landed durability slices.

In progress:

- auth/storage durability convergence is ready in PR #107 but is not part of this release baseline;
- process-local state ownership and lifecycle classification remain incomplete.

## Required delivery sequence

| Order | Milestone       | Priority | Status      | Exit gate                                                                    |
| ----: | --------------- | -------- | ----------- | ---------------------------------------------------------------------------- |
|     1 | `ARCH-2B`       | Critical | Next        | Exhaustive fail-closed architecture gate; no false-success report            |
|     2 | `FRONTEND-2C`   | High     | Planned     | Zero-error lint/format, protected gates and bundle budgets                   |
|     3 | `RUNTIME-2D`    | High     | Planned     | One authoritative runtime/provider/memory/orchestration ownership map        |
|     4 | `DURABILITY-2E` | High     | In progress | Land convergence, finish consumer migration and classify process-local state |
|     5 | `SECURITY-2G`   | High     | Planned     | Protected dependency/SAST/secret/image/SBOM policy and RBAC decision         |
|     6 | `DOC-202`       | Medium   | Planned     | One current authority chain; stale audits bannered; generated inventories    |
|     7 | `STUDIO-2F`     | Medium   | Deferred    | Native assets/GUI/runtime/place delivery with desktop evidence               |
|     8 | `AUTONOMY-3A`   | High     | Deferred    | Real engine-backed autonomous phases and restart recovery                    |
|     9 | `COLLAB-3B`     | Medium   | Deferred    | Re-evaluated only after preceding gates                                      |

`DOC-202` follows the core architecture/runtime/durability/security control decisions and precedes optional product-scope expansion in `STUDIO-2F`. It is not a dependency for implementing native Studio code, but it is a governance gate for claiming that capability as current product truth.

## ARCH-2B

Deliver:

- exhaustive subsystem manifest;
- fail-closed handling for missing or parse-invalid manifests;
- AST dependency extraction including re-exports;
- unknown-domain failures;
- executable layer rules;
- explicit cycle policy;
- identical report/console/exit semantics;
- protected negative-control tests.

Stop condition: no runtime expansion before this gate is truthful.

## FRONTEND-2C

Deliver:

- mechanical Prettier baseline in isolated change;
- zero-error, zero-warning ESLint baseline;
- protected lint and format checks;
- direct icon imports;
- client/SSR bundle budgets;
- expanded service/read-model/auth/realtime recovery tests.

## RUNTIME-2D

Deliver:

- canonical ownership map;
- bounded responsibility for PlanExecutor and Pipeline v2;
- autonomous path either preview-labeled or engine-backed;
- alternate provider/agent/memory/integration stacks adopted or retired;
- import bans for deprecated stacks;
- removal plan for dead composition roots.

## DURABILITY-2E

Landed:

- canonical awaitable durable mutation and batch boundaries;
- acknowledged project creation/duplication;
- acknowledged blueprint deletion cascades;
- serialized chat creation/deletion;
- acknowledged generation-history writes and pre-start pipeline reservation;
- rejection, rollback, restart and invariant evidence.

Remaining:

- land auth/storage convergence PR #107;
- finish the direct-consumer inventory and remove or classify compatibility paths;
- define uniform retry, reconciliation and conflict semantics;
- classify route/service Maps as cache, telemetry, preview or durable state;
- add cache bounds and telemetry retention policy.

## SECURITY-2G

Deliver:

- dependency severity policy and exception register;
- PR and scheduled audits;
- SAST/secret/image scanning and SBOM;
- route-level RBAC implementation or explicit removal of unsupported claims;
- security evidence attached to protected Merge Gate.

## DOC-202

Deliver:

- banner superseded audits and obsolete architecture maps;
- replace manual inventory counts with generated evidence;
- remove unsupported aggregate health claims;
- link current project-control documents to this refresh;
- preserve historical evidence without presenting it as current truth.

## STUDIO-2F

Only after core gates remain green:

- native model/mesh/audio/image insertion;
- generated ScreenGui/control construction;
- runtime semantic validator in canonical package;
- explicit `.rbxl`/place publication decision;
- real desktop acceptance for each retained capability.

## Release interpretation

A green backend CI proves a strong release baseline and the exact shared production contract. It does not prove:

- architecture boundaries are exhaustive or fail-closed;
- autonomous phases run real engines;
- every user-visible mutation is durably acknowledged;
- all process-local state has a defined lifecycle;
- RBAC is enforced;
- native Roblox assets/GUI/place publication exist.

## Product expansion rule

Marketplace, enterprise collaboration, plugin ecosystem expansion and additional runtime frameworks remain deferred until `ARCH-2B`, `FRONTEND-2C`, `RUNTIME-2D`, the remaining `DURABILITY-2E` work and `SECURITY-2G` satisfy their definitions of done. Documentation authority cleanup in `DOC-202` must precede new product-scope claims.
