# Technical Audit v2.0 Refresh — Architecture Gap Report

**Backend release baseline:** `a22d060b7fa44607c97a30d60b633e5545f8cfdb`  
**Frontend contract baseline:** `95824451a92a9cdfe331dbc678bbe98467b53021`  
**Pending, excluded from baseline:** backend PR #107 at `83d6b08ac15f67ac6e836bffb38506e3b32c45ab`

## Authority model

1. Executable code, tests, workflows and release evidence at the pinned commits.
2. Current project-control documents.
3. Architecture manifest only for rules it actually enforces.
4. Historical reports as context, never as current proof.

## Executive gaps

| Expected | Actual | Impact | Required action |
|---|---|---|---|
| Exhaustive domain manifest | Real subsystem count exceeds modeled domains; stale and unknown paths remain | Imports can bypass policy | Complete `ARCH-2B` |
| Manifest validation fails closed | `RuntimeBoundaryGuard.validate()` can treat a missing or parse-invalid manifest as skipped/passed | Enforcement can report healthy while disabled | Missing or invalid manifests must produce a failing result and non-zero exit |
| Report and CI agree | Report can be `FAIL` while CLI exits successfully | Green CI can certify a failed graph | Align report, console and exit semantics |
| Layer rules enforced | Declared `canImportFrom` rules are not fully executable | Architecture claims are documentary | Enforce with positive/negative tests |
| Complete dependency graph | Current extraction misses re-exports and selected import forms | Hidden edges and cycles | Use TypeScript AST traversal |
| Unknown domains rejected | Unknown internal modules can be skipped | Unmodeled dependencies escape controls | Fail manifest validation |
| One execution ownership model | PlanExecutor, Pipeline v2, autonomous and integration runtime overlap | Different semantics by endpoint | Publish and enforce ownership matrix |
| Autonomous means real engines | Mounted orchestrator simulates phases | Product claims exceed behavior | Connect engines or relabel preview |
| HTTP success means durable write | Major project, blueprint, chat and generation-history flows are acknowledged; auth/storage convergence and residual consumers remain | Partial phantom-success risk remains | Finish `DURABILITY-2E` and land PR #107 |
| Production RBAC exists | Roles/middleware exist but are not mounted | Authorization claims exceed enforcement | Mount or retire claims |
| Native Studio content | Lua is native; other content is metadata | Asset/GUI/place claims remain partial | Keep separate `STUDIO-2F` scope |

## Closed or materially reduced gaps since original TECH-AUDIT-2

- Browser auth JSON no longer exposes reusable access/refresh credentials.
- Frontend no longer hardcodes Studio verification to false.
- Cross-repository 40-check production contract is protected in both repositories.
- Active release/auth terminology was corrected.
- Project creation/duplication, blueprint deletion cascades, chat creation/deletion, and generation-history/pipeline reservation now wait for durable acknowledgement.
- CI contains rejection, rollback, restart, release-composition and post-removal invariant evidence for the landed durability slices.

These items should remain in historical evidence but are not current blockers. The remaining auth/storage convergence in PR #107 is not counted as landed evidence.

## Boundary firewall target

`ARCH-2B` is complete only when:

- every real backend subsystem is modeled or explicitly excluded;
- stale/nonexistent paths fail manifest validation;
- missing or parse-invalid manifests make `RuntimeBoundaryGuard.validate()` fail, produce a failing console/report status, and terminate CI with a non-zero process exit;
- imports, side-effect imports, dynamic imports, `require`, and re-exports are parsed by AST;
- unknown internal domains fail;
- layer rules are enforced;
- cycles have an explicit policy and temporary allowlist where justified;
- generated report status, console summary and process exit code always agree;
- CI contains negative controls proving that forbidden edges fail.

## Runtime ownership gaps

| Concern | Canonical path | Competing paths | Disposition |
|---|---|---|---|
| Generation | `PlanExecutor` via `GameGenerationService` | Pipeline v2, autonomous orchestrator, runtime controller | Keep one core; bound adapters |
| Agent registry | `agents/core/AgentRegistry` | Alternate registries/orchestrators | Prevent new composition roots |
| Providers | `ai/providerFactory.ts` and top-level adapters | `providers/ai` | Consolidate useful behavior or retire |
| Prompts | Versioned PromptEngine | Legacy fallback | Time-box fallback |
| Memory | MemoryEngine + AgentMemoryBridge | ai memory, knowledge memory, local Maps | Define one durable contract |
| Collaboration | mounted agents/collaboration | top-level collaboration and alternate stacks | Defer product expansion |
| Studio | studio/v2 shared runtime and canonical plugin | older/import direction classes | Preserve verified outbound path |

## Data and durability gaps

Confirmed durable core includes users, sessions, projects, blueprints, versions, generation executions/history, API keys, artifacts and conversations under PostgreSQL configuration.

Landed acknowledgement evidence now covers:

1. project creation and duplication;
2. blueprint deletion cascades;
3. chat message creation and conversation deletion;
4. generation-history writes and pre-start pipeline reservation;
5. rollback/rejection and restart behavior for those paths.

Remaining contract gaps:

- auth registration/session storage convergence is prepared in PR #107 but excluded from this baseline;
- remaining direct durable consumers must be inventoried and migrated or explicitly classified;
- retry/reconciliation semantics are not uniform;
- process-local Maps still require cache, telemetry, preview or durable-state ownership;
- multi-instance cache invalidation is not claimed.

Required design:

- production success only after a committed durable write is acknowledged;
- in-memory implementations treated as test/preview compatibility, not production durability evidence;
- defined retry/reconciliation and conflict semantics;
- failure tests proving no partial ownership or phantom success;
- explicit classification of every process-local Map as cache, telemetry, preview or durable product state.

## Frontend architecture gaps

Strengths:

- one canonical web repository;
- one REST adapter, one Socket.IO adapter and one Workspace read model;
- production SSR and exact backend contract evidence;
- real Studio verification state.

Remaining:

- lint and format are not yet a clean protected baseline;
- response/event types are manually duplicated rather than generated/shared/schema-validated;
- route rendering, auth mutation and realtime recovery coverage is limited;
- bundle budgets and direct icon imports remain;
- release identity still needs a durable governance workflow, not informal pin updates.

## Security architecture gaps

- Browser session transport is cookie-only and storage-backed.
- Project ownership is a real tenant boundary.
- RBAC remains unmounted.
- Dependency/SAST/secret/image/SBOM policy is incomplete.
- Security claims must distinguish browser cookies, API keys and any non-browser bearer contract.

## Roblox architecture gaps

Verified path:

`generation → durable artifacts → project command → plugin poll → ACK → materialize → exact receipts → backend verification → Frontend verified state`

Explicit scope limits:

- Lua creates Script, LocalScript and ModuleScript instances.
- Non-Lua output is metadata, not native models/assets.
- No canonical generated ScreenGui/control construction.
- No place publication or canonical `.rbxl` delivery.
- RuntimeValidator is not in the canonical plugin package.

## Documentation gaps

- Hundreds of historical Markdown files create competing authority.
- Old counts and manual health scores should not be treated as executable evidence.
- Historical reports must carry superseded banners where their titles imply current authority.
- Inventories and scores should be generated from scripts wherever practical.
