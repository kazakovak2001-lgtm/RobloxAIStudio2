# Technical Audit v2.0 Refresh — Roadmap Update

**Backend baseline:** `2ecb3997eb6fab5074c438f10dedcc1715381e11`  
**Frontend baseline:** `739b43cbc5f991c1852e80b30fe38c0e7c02d681`

## Current state

Completed:

- independent backend/frontend release topology;
- durable project/blueprint/history core;
- standalone Workspace;
- desktop-verified Studio artifact delivery;
- legacy embedded frontend removal and invariant guard;
- TECH-AUDIT-2 baseline;
- HARDEN-2A browser auth, Studio-state and cross-repository contract corrections.

## Required delivery sequence

| Order | Milestone | Priority | Status | Exit gate |
|---:|---|---|---|---|
| 1 | `ARCH-2B` | Critical | Next | Exhaustive truthful architecture gate; no false-success report |
| 2 | `FRONTEND-2C` | High | Planned | Zero-error lint/format, protected gates and bundle budgets |
| 3 | `RUNTIME-2D` | High | Planned | One authoritative runtime/provider/memory/orchestration ownership map |
| 4 | `DURABILITY-2E` | High | Planned | Awaited durable writes and classified process-local state |
| 5 | `SECURITY-2G` | High | Planned | Protected dependency/SAST/secret/image/SBOM policy and RBAC decision |
| 6 | `STUDIO-2F` | Medium | Deferred | Native assets/GUI/runtime/place delivery with desktop evidence |
| 7 | `AUTONOMY-3A` | High | Deferred | Real engine-backed autonomous phases and restart recovery |
| 8 | `COLLAB-3B` | Medium | Deferred | Re-evaluated only after preceding gates |

## ARCH-2B

Deliver:

- exhaustive subsystem manifest;
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

Deliver:

- awaitable mutation contract;
- transaction/failure semantics;
- database rejection tests;
- restart-safe executor/checkpoint state where product-visible;
- classification and migration plan for route/service Maps;
- cache bounds and telemetry retention policy.

## SECURITY-2G

Deliver:

- dependency severity policy and exception register;
- PR and scheduled audits;
- SAST/secret/image scanning and SBOM;
- route-level RBAC implementation or explicit removal of unsupported claims;
- security evidence attached to protected Merge Gate.

## STUDIO-2F

Only after core gates remain green:

- native model/mesh/audio/image insertion;
- generated ScreenGui/control construction;
- runtime semantic validator in canonical package;
- explicit `.rbxl`/place publication decision;
- real desktop acceptance for each retained capability.

## Release interpretation

A green backend CI currently proves a strong release baseline and the exact shared production contract. It does not prove:

- architecture boundaries are exhaustive;
- autonomous phases run real engines;
- every user-visible mutation is durably acknowledged;
- RBAC is enforced;
- native Roblox assets/GUI/place publication exist.

## Product expansion rule

Marketplace, enterprise collaboration, plugin ecosystem expansion and additional runtime frameworks remain deferred until `ARCH-2B`, `FRONTEND-2C`, `RUNTIME-2D`, `DURABILITY-2E` and `SECURITY-2G` satisfy their definitions of done.
