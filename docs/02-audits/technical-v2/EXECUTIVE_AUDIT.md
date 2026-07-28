# Technical Audit v2.0 — Executive Audit

**Audit date:** July 28, 2026  
**Tracking issue:** [#38](https://github.com/kazakovak2001-lgtm/RobloxAIStudio2/issues/38)  
**Backend baseline:** `kazakovak2001-lgtm/RobloxAIStudio2@a2f596dcb03d92791f96d1b217bf33a534eeddcb`  
**Frontend baseline:** `kazakovak2001-lgtm/Frontend@1036c3ef9705d145cb9700cd14268a33d2abdd58`

## Executive decision

The project has a strong release foundation: both repositories install and build cleanly, the backend protected pipeline is comprehensive, PostgreSQL restart and ownership tests pass, the standalone Frontend SSR image is verified, and the real Roblox Studio import acknowledgement/result flow has desktop evidence.

The implementation is not yet accurately described as feature-complete or fully production-hardened. The recommended decision is:

> Continue controlled beta and hardening work, but do not expand into F-12 collaborative development or additional parallel runtime frameworks until the release-correctness, architecture-firewall, and cross-repository contract gates in this audit are complete.

The first implementation wave after this audit is `HARDEN-2A`, starting with removal of reusable credentials from auth JSON responses and wiring the already-returned Studio verification state into the standalone Frontend.

## Evidence dashboard

| Area                     |                         Audit result | Evidence                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -----------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository and builds    |                               Strong | Backend has 1,088 tracked files; Frontend has 133. Clean installs, TypeScript, and production builds pass.                                                                                                                                                                                                              |
| Backend verification     |                               Strong | 61 passing test files, 672 passing tests, one skipped test; protected CI also covers lint, format, PostgreSQL restart, release images, HTTPS composition, rollback, and cleanup invariants.                                                                                                                             |
| Frontend verification    |                                Mixed | TypeScript, build, responsive QA, seven native workspace tests, and the 40-check production-mode backend integration suite pass. Lint currently reports 640 errors and 12 warnings, while 70 files fail the format check; neither gate runs in Frontend CI.                                                             |
| Architecture enforcement |                     Needs correction | 46 real backend subsystems exist, but only 32 are modeled. The generated boundary report is `FAIL` with four cycles while the CLI exits successfully. Layer rules and re-export edges are not enforced.                                                                                                                 |
| AI runtime               |                                Mixed | Prompt, context, provider, agent, memory, evaluation, retry, and canonical `PlanExecutor` paths exist and are tested. The active autonomous API still simulates its phases, and several alternative orchestration/provider/memory stacks are isolated or only integration-test connected.                               |
| Security                 |                     Needs correction | bcrypt, secure cookies, origin checks, rate limiting, storage-backed opaque sessions, API-key digests, and ownership checks exist. Login/register/refresh responses still return reusable access and refresh tokens to JavaScript, RBAC enforcement is not mounted, and dependency/security scanning is absent from CI. |
| Roblox Studio            | Strong core, partial product surface | Exact execution/artifact/hash verification and real desktop import are complete. Lua scripts and metadata are materialized; actual model/mesh/audio asset insertion, generated in-game GUI materialization, place publishing, and the deferred runtime validator are not complete.                                      |
| Documentation            |                  Needs consolidation | 335 tracked Markdown files exist, including 282 under `docs/`. Current control documents contained stale counts, unsupported health scores, JWT terminology for opaque sessions, and an obsolete 2026-07-13 master audit.                                                                                               |

## Highest-priority findings

| ID       | Severity | Finding                                                                                                                                                                | Immediate outcome                                                                                |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TAV2-001 | High     | Auth endpoints set httpOnly cookies but also return access and refresh tokens in JSON.                                                                                 | Remove tokens from browser-facing response bodies and add regression tests.                      |
| TAV2-002 | High     | `workspaceReadModel.ts` declares and assigns `studioArtifactVerified: false` even though the backend status response contains `artifactVerified`.                      | Parse the real field and cover verified/failed/pending states.                                   |
| TAV2-003 | High     | The architecture firewall omits 15 real subsystems, ignores declared layer rules, misses re-exports, skips unknown domains, and does not fail on four reported cycles. | Repair the manifest and validator before using “zero violations” as an architecture claim.       |
| TAV2-004 | High     | The mounted `AutonomousOrchestrator` waits and returns simulated outputs instead of invoking the named engines.                                                        | Relabel as preview or connect phases to canonical services behind an integration test.           |
| TAV2-005 | High     | Frontend CI omits lint, format, and the available production-mode integration suite.                                                                                   | Establish a green baseline and make those checks protected.                                      |
| TAV2-006 | High     | The synchronous storage interface acknowledges mutations before asynchronous PostgreSQL persistence is confirmed.                                                      | Define an explicit durability acknowledgement contract and test database-write failure behavior. |

## What is demonstrably complete

- The embedded frontend was physically removed and a permanent schema-v5 invariant guard preserves the decommission boundary.
- The standalone Frontend is the only web client and has a production SSR image, health endpoint, and responsive workspace gate.
- Project ownership, production REST authentication, production Socket.IO authentication, PostgreSQL restart behavior, and cross-user isolation have executable evidence.
- `PlanExecutor` is the canonical generation execution entrypoint used by the primary generation service.
- Generation outputs are recorded as Studio artifacts and transferred through one command ledger.
- The canonical plugin package is deterministic and contains only nine allowlisted active Lua sources.
- Roblox Studio acknowledgement and result processing verify the exact execution ID, artifact IDs, and SHA-256 hashes.
- The backend package, typecheck, lint, format, tests, Docker image, composed release, rollback, and cleanup invariant gates pass on the audited baseline.

## What is not complete

- A trustworthy architecture boundary gate.
- Browser-visible Studio verification in the canonical Frontend.
- A real engine-backed autonomous pipeline.
- Protected Frontend lint/format and cross-repository integration checks.
- Durable acknowledgement for every currently in-memory or asynchronous operational store.
- Production RBAC enforcement despite role and permission definitions.
- Actual Studio insertion of generated non-Lua assets and generated in-game GUI structures.
- Runtime execution parallelism promised by `ExecutionOptions.parallel`.
- Dependency/SAST automation and closure of current dependency advisories.
- A single authoritative module/runtime map with old reports clearly superseded.

## Baseline metrics

| Metric                              |                           Backend |                          Frontend |
| ----------------------------------- | --------------------------------: | --------------------------------: |
| Tracked files                       |                             1,088 |                               133 |
| Tracked TypeScript/TSX              |                               627 |                                99 |
| Production files under `server/src` |                               547 |                                 — |
| Backend test files                  |                                62 |                                 — |
| Frontend source TypeScript/TSX      |                                 — |                                97 |
| Frontend TSX components             |                                 — |                                80 |
| Native test files / cases           |                  62 / 672 passing |                     1 / 7 passing |
| Production integration checks       | Protected backend/composed suites | 40 passing locally; not protected |
| Markdown files                      |                               335 |                                11 |
| Lua sources                         |            14 tracked; 9 packaged |                                 — |

## Recommended order

1. `HARDEN-2A`: credential response hardening, Frontend Studio verification, and protected production-mode contract E2E.
2. `ARCH-2B`: make the manifest exhaustive and make the boundary gate truthful.
3. `FRONTEND-2C`: establish a green lint/format baseline, add gates, and remove the Lucide bundle hotspot.
4. `RUNTIME-2D`: choose and consolidate canonical orchestration/provider/memory paths; replace simulated autonomous phases.
5. `DURABILITY-2E`: make operational state and write acknowledgement match production claims.
6. `STUDIO-2F`: implement real non-Lua asset/GUI/place delivery only after the core contracts remain green.
7. Re-evaluate F-12 collaborative development after all preceding exit gates pass.

The detailed dependencies and exit gates are in [ROADMAP_v2_UPDATE.md](./ROADMAP_v2_UPDATE.md) and the ready-to-implement work items are in [SPRINT_BACKLOG.md](./SPRINT_BACKLOG.md).

## Audit index

- [MODULE_REGISTRY.md](./MODULE_REGISTRY.md) — repository and runtime inventory
- [FEATURE_MATRIX.md](./FEATURE_MATRIX.md) — evidence-based implementation status
- [ARCHITECTURE_GAP_REPORT.md](./ARCHITECTURE_GAP_REPORT.md) — specification-to-code gaps
- [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) — prioritized debt register
- [ROADMAP_v2_UPDATE.md](./ROADMAP_v2_UPDATE.md) — recommended delivery sequence
- [SPRINT_BACKLOG.md](./SPRINT_BACKLOG.md) — implementable sprint backlog

## Validation performed

- Backend: `npm run ci`, `npm run build`, architecture and cleanup invariant reports.
- Frontend: clean `npm ci`, `npx tsc --noEmit`, `npm run test:workspace`, `npm run build`, `npm run lint`, and a separate Prettier check.
- Cross-repository: all 40 checks in `scripts/e2e-backend.mjs` with the backend in production mode.
- Security/dependencies: production and full-development `npm audit` for both repositories.
- Static architecture: TypeScript-AST import/re-export inventory compared with `ImportBoundaryValidator`.
- Roblox: canonical package allowlist, plugin contract tests, backend Studio runtime, and existing desktop acceptance evidence.

No production code or repository history was rewritten by this audit.
