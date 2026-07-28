# Technical Audit v2.0 — Feature Matrix

**Audit date:** July 28, 2026  
**Backend baseline:** `a2f596dcb03d92791f96d1b217bf33a534eeddcb`  
**Frontend baseline:** `1036c3ef9705d145cb9700cd14268a33d2abdd58`

## Scoring model

Percentages are audit estimates of implemented, connected, verified behavior—not code coverage or a contractual SLA.

|    Band | Classification | Definition                                                                                                         |
| ------: | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| 90–100% | Complete       | Production-connected, protected by representative verification, and no material scope gap found.                   |
|  75–89% | Operational    | Core path works; bounded hardening, durability, or coverage work remains.                                          |
|  50–74% | Partial        | Important behavior exists, but at least one material contract is missing or misleading.                            |
|  25–49% | Prototype      | Mounted or tested implementation exists, but substantial behavior is stubbed, simulated, isolated, or unprotected. |
|   0–24% | Missing        | No meaningful implementation evidence.                                                                             |

The unweighted mean across this matrix is **66%**. That number is only a planning baseline; the high-severity findings must be closed regardless of the average.

## Matrix

| Capability                                              | Status      | Completion | Evidence that is complete                                                                                                                                                | Remaining work                                                                                                                                                       |
| ------------------------------------------------------- | ----------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy frontend decommission                            | Complete    |       100% | Exact 176-path absence, package pruning, release isolation, and schema-v5 steady-state guard are protected.                                                              | None in current scope.                                                                                                                                               |
| Backend CI and repository gates                         | Complete    |        90% | Typecheck, ESLint, Prettier, 672 tests, PostgreSQL restart, Docker, composed HTTPS release, rollback, validation, and cleanup invariants.                                | Add security/dependency scanning; correct the boundary gate’s false-success behavior.                                                                                |
| Frontend CI and quality gates                           | Partial     |        60% | TypeScript, seven workspace tests, production build/image, SSR health, and responsive QA pass.                                                                           | Fix 640 lint errors/12 warnings and 70 unformatted files; protect lint, format, and integration E2E.                                                                 |
| Independent release topology                            | Complete    |        90% | Backend and Frontend images run independently and together behind HTTPS; rollback rehearsal is executable.                                                               | Replace the manually pinned Frontend commit update process with a contract/release identity workflow.                                                                |
| Authentication and session validation                   | Partial     |        70% | bcrypt cost 12, random storage-backed opaque sessions, httpOnly secure cookies in production, origin checks, login rate limiting, production REST/Socket authentication. | Stop returning access/refresh tokens in JSON, hash refresh tokens at rest, correct JWT terminology, add expiry/rotation/response-shape tests.                        |
| Role-based authorization                                | Prototype   |        25% | Roles, permission tables, and a tested `PermissionMiddleware` class exist.                                                                                               | Mount authorization on privileged routes and add negative route-level tests; today ownership/authentication are the real guards.                                     |
| Durable storage                                         | Operational |        75% | Migrations, pre-listen hydration, PostgreSQL restart E2E, ownership isolation, shutdown flush, and durable primary collections.                                          | Await/acknowledge durable writes, define DB-failure semantics, and migrate route-local/operational maps that are claimed as durable.                                 |
| Projects, blueprints, history, ownership                | Complete    |        90% | Shared project runtime, durable blueprints/executions/history, export, ownership checks, and cross-user E2E.                                                             | Expand mutation/long-running recovery coverage and remove remaining route-local state around adjacent features.                                                      |
| Standalone Workspace                                    | Operational |        75% | One REST adapter, one realtime adapter, durable read model, stage registry, responsive production QA, and authenticated integration.                                     | Parse real Studio verification, add route/service tests, enforce quality gates, and cover realtime recovery.                                                         |
| AI providers and agent registry                         | Operational |        75% | Six environment-selectable provider modes plus stub behavior, canonical 16-agent registry, prompt wiring, retry/fallback implementations, and tests.                     | Consolidate the alternate `providers/ai` and agent registries; test real provider contracts without relying on stubs.                                                |
| Prompt and context engines                              | Operational |        75% | Versioned PromptEngine, validation, default prompts, ContextManager/serializer/validator, BaseAgent integration, and focused tests.                                      | Retire/time-box legacy prompt fallback and define durable/context-size policies.                                                                                     |
| Memory and learning                                     | Partial     |        55% | `MemoryEngine`, agent bridge, AI memory store, knowledge memory, semantic retrieval, and focused tests exist.                                                            | Select one canonical durable model; current systems overlap and most memory/feedback is process-local.                                                               |
| Planning and canonical execution                        | Partial     |        70% | Planner, task graph, DAG validation, canonical `PlanExecutor`, evaluation, retry, adaptive fallback, tracing, memory, artifacts, and multiple mounted consumers.         | Implement or remove `parallel`, persist/recover executions, and consolidate Pipeline v2/runtime-controller overlap.                                                  |
| Autonomous pipeline                                     | Prototype   |        35% | Mounted lifecycle API, phases, events, pause/resume/cancel, budget/checkpoint data structures.                                                                           | Replace timed simulated outputs with canonical engines, persist sessions/checkpoints, and add production integration evidence.                                       |
| Generation, Lua, validation, artifacts                  | Operational |        80% | Canonical generation service, agent output, real Lua script normalization, validation, execution history, artifact recording, and Studio handoff.                        | Reduce overlapping generators, replace placeholder asset behaviors, and add stronger artifact schema/contract sharing.                                               |
| Simulation, economy, lifecycle, world, playtest, repair | Partial     |        65% | Mounted APIs and domain engines exist; multiple tests and generation bridges are present.                                                                                | Persist state, replace simulated repair/playtest behavior, and close conceptual feedback-loop integrations.                                                          |
| Agent collaboration                                     | Prototype   |        40% | Mounted status/message/consensus endpoints and `agents/collaboration` implementation exist.                                                                              | LLM reasoning is stubbed, the top-level collaboration stack is isolated, and production collaborative editing/F-12 is not implemented.                               |
| Analytics and observability                             | Partial     |        55% | Tracing, execution graphs, analytics routes, metrics, feedback signals, request logs, and Socket events.                                                                 | Consolidate duplicate analytics, export metrics/logs externally, persist traces, and add alerting/SLOs.                                                              |
| Studio command delivery and verification                | Complete    |        95% | Shared runtime, project-scoped sessions, deterministic plugin package, command polling, ACK/result ordering, exact artifact ID/hash receipts, and real desktop evidence. | Expose verified state correctly in the Frontend and keep package/runtime evidence current.                                                                           |
| Studio assets, GUI, and place delivery                  | Prototype   |        45% | Lua scripts map to Roblox services; metadata maps to a deterministic Explorer folder; plugin dock UI works.                                                              | Insert real models/meshes/audio/images, materialize generated in-game GUI, validate the imported runtime, and support place publication/export if retained in scope. |
| Security automation                                     | Prototype   |        40% | Source validation catches credential-like material; runtime hardening and production isolation tests exist.                                                              | Add dependency audit policy, SAST/CodeQL or equivalent, secret scanning policy, SBOM/image scan, and advisory triage.                                                |
| Documentation and governance                            | Partial     |        50% | Project-control structure, decision log, templates, release evidence, and extensive historical reports.                                                                  | Make this audit the current technical baseline, archive/banner stale reports, remove unsupported scores, and automate inventory drift checks.                        |

## Historical roadmap reconciliation

The old UX-4 roadmap records implementation delivery, not current production completeness. TECH-AUDIT-2 changes the interpretation of these items:

| Historical item             | Previous label | TECH-AUDIT-2 classification                                                                                            |
| --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F-6 Autonomous Pipeline     | Complete       | Prototype: API/event lifecycle is active, engine work is simulated.                                                    |
| F-9 Multi-Project Workspace | Complete       | Operational/complete core: ownership and durable project paths pass; adjacent route state remains in memory.           |
| F-10 Real Authentication    | Complete       | Partial hardening: authentication is real, but credentials leak into JSON responses and JWT terminology is inaccurate. |
| F-11 Persistent Storage     | Complete       | Operational: primary records restart correctly; durability acknowledgement and secondary stores remain.                |
| STUDIO-1                    | Complete       | Core delivery/verification complete; asset/GUI/place scope remains a separate future capability.                       |
| F-12 Collaborative Dev      | Deferred       | Still deferred; must not start before architecture/runtime consolidation.                                              |

## Roblox-specific matrix

| Roblox surface     | Status             | Evidence                                                                                                            | Gap                                                       |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Studio Bridge      | Complete           | Project-scoped connection, heartbeat, reconnect, command queue, exact verification                                  | Frontend verified-state parsing                           |
| Explorer hierarchy | Operational        | Creates/updates Script, LocalScript, ModuleScript, folders, and metadata StringValues                               | No full generated scene/model hierarchy                   |
| Place integration  | Prototype          | Works inside an open Studio place through a plugin                                                                  | No canonical `.rbxl` publication or place deployment      |
| Roblox services    | Operational        | Routes Lua paths to ServerScriptService, ReplicatedStorage, ServerStorage, StarterGui, StarterPlayer, and Workspace | Non-script instances are not materialized                 |
| Lua                | Complete core      | Non-empty validated script arrays, path/class mapping, replace/update behavior                                      | Runtime semantic validation is deferred                   |
| Assets             | Prototype          | Asset plans/manifests exist and metadata transfers                                                                  | No real InsertService/asset instance materialization      |
| GUI                | Prototype          | Plugin DockWidget GUI works; generated UI can be represented as code/metadata                                       | No direct generated ScreenGui/control construction        |
| Runtime validation | Prototype/excluded | `RuntimeValidator.lua` exists                                                                                       | Explicitly excluded from canonical package and entrypoint |

## Release interpretation

“Green CI” is true for the audited backend protected branch. It does not mean:

- the boundary report is passing;
- the standalone Frontend is lint/format clean;
- the autonomous pipeline invokes real engines;
- all process-local state is durable;
- every Studio artifact becomes a native Roblox asset;
- every historical “complete” label remains accurate.

The corrective sequence is defined in [ROADMAP_v2_UPDATE.md](./ROADMAP_v2_UPDATE.md).
