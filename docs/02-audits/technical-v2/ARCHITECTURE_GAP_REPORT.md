# Technical Audit v2.0 — Architecture Gap Report

**Audit date:** July 28, 2026  
**Backend baseline:** `a2f596dcb03d92791f96d1b217bf33a534eeddcb`  
**Frontend baseline:** `1036c3ef9705d145cb9700cd14268a33d2abdd58`

## Authority model used by this audit

The repository contains many architecture reports from different implementation eras. TECH-AUDIT-2 uses this precedence:

1. executable code, tests, package locks, CI workflows, and release evidence at the pinned baseline;
2. `docs/00-project-control/CURRENT_STATE.md` and `ROADMAP_STATUS.md`, after TECH-AUDIT-2 corrections;
3. `architecture.manifest.json`, but only for rules it actually enforces;
4. current standalone Frontend source and CI;
5. historical/archived reports as context, never as proof of current behavior.

`docs/audits/MASTER_ARCHITECTURE_AUDIT.md` is a July 13 historical snapshot. It describes the deleted embedded frontend, missing/dead modules that have since changed, older dependency versions, and “no circular dependencies.” It is superseded by this audit.

## Executive architecture gaps

| Expected architecture                                  | Actual implementation                                                                                               | Consequence                                                                              | Required decision                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| One exhaustive domain manifest                         | 46 real subsystem directories; 32 manifest domains; 15 real modules unmodeled; stale `engine` modeled               | Imports involving unknown modules can bypass policy and graph reporting                  | Reconcile the manifest with every subsystem and assign an owner/layer |
| Boundary report status matches CI outcome              | Report is `FAIL` with four cycles; CLI exits 0 because only critical import violations fail                         | Protected CI can display “PASS” while its JSON evidence says `FAIL`                      | Define cycle policy and make exit/report semantics identical          |
| Declared layer isolation is enforced                   | `layers.*.canImportFrom` is parsed by JSON but ignored by `ImportBoundaryValidator`                                 | The central architecture claim is not executable                                         | Implement layer rules and add negative tests                          |
| Complete dependency graph                              | Regex sees 1,208 imports; AST scan found 1,446 import/re-export/dynamic specs, including 252 re-exports             | Re-export edges and some import forms are invisible                                      | Replace regex extraction with TypeScript AST traversal                |
| Unknown domains are rejected or reported               | Relative imports resolving to `unknown` are skipped                                                                 | 281 observed internal edges target unmodeled modules; 345 originate in unmodeled modules | Treat unknown internal domains as configuration failures              |
| One production execution engine                        | `PlanExecutor` is primary, but Pipeline v2, autonomous, runtime-controller, and deprecated integrator paths coexist | Behavior, persistence, and recovery semantics vary by endpoint                           | Publish an execution ownership matrix and consolidate deliberately    |
| “Autonomous” invokes real domain engines               | Mounted orchestrator uses timers and simulated return values                                                        | Product/API claims exceed behavior                                                       | Relabel preview or connect phases to canonical services               |
| Durable responses represent durable writes             | Synchronous storage mutations update cache and schedule PostgreSQL persistence asynchronously                       | A route can return success before the database accepts the write                         | Introduce awaitable mutation/transaction semantics                    |
| httpOnly tokens are inaccessible to browser JavaScript | Cookies are httpOnly, but auth JSON responses return the same access and refresh tokens                             | Refresh/login responses can expose reusable credentials to script                        | Remove credentials from browser response bodies                       |
| Frontend reflects backend Studio truth                 | Backend returns exact verification fields; Frontend hardcodes `false`                                               | Verified Studio imports remain blocked/incorrect in the canonical UI                     | Parse and test the real contract                                      |
| Studio “assets and GUI” are native instances           | Lua becomes scripts; other artifacts become JSON/text `StringValue` metadata                                        | Asset plans are visible but models/meshes/audio/GUI are not materialized                 | Separate “verified artifact receipt” from “native asset delivery”     |

## Boundary firewall analysis

### Coverage mismatch

Real backend subsystems absent from `architecture.manifest.json`:

`analytics`, `assets`, `compiler`, `domain`, `integration`, `jobs`, `knowledge`, `lua`, `orchestrator`, `platform`, `playtest`, `repair`, `runtime`, `services`, `ui-gen`.

Stale declarations:

- `engine` points to `server/src/engine`, which does not exist.
- deprecated `_quarantine/llm/LLMProvider` remains documented, but `_quarantine` no longer exists.

### Enforcement mismatch

`ImportBoundaryValidator` currently:

- loads `domains`, `forbiddenEdges`, and `hardBans`;
- does not load or evaluate `layers.*.canImportFrom`;
- extracts only selected static imports, dynamic imports, and `require`;
- does not extract `export ... from` / `export * from`;
- skips internal imports when either side resolves to `unknown`;
- excludes tests and quarantine as intended;
- detects domain cycles but does not classify them as violations.

Static comparison on the audit baseline:

| Measure                                              |        Current validator | TypeScript AST inventory |
| ---------------------------------------------------- | -----------------------: | -----------------------: |
| Production files                                     |                      547 |                      547 |
| Import-like specifications                           |                    1,208 |                    1,446 |
| Re-export specifications                             |              Not modeled |                      252 |
| Internal edges targeting an unmodeled subsystem      |                  Skipped |                      281 |
| Internal edges originating in an unmodeled subsystem | Source becomes `unknown` |                      345 |

### Current cycles

The generated report contains four domain cycles:

1. `ai → providers → ai`
2. `execution → socket → execution`
3. `execution → planning → socket → execution`
4. `assembly → governance → assembly`

The script header says any circular dependency fails the build. The actual exit logic fails only `critical` import violations and treats cycles as console warnings. `generateReport()` independently sets status to `FAIL` whenever a cycle exists. This contradiction is TAV2-003.

### Corrective target

The boundary gate is complete only when:

- all 46 real subsystem directories are modeled or explicitly excluded with a reason;
- missing/stale paths fail manifest validation;
- AST extraction covers imports, side-effect imports, dynamic imports, `require`, and re-exports;
- internal `unknown` source/target domains fail configuration validation;
- layer `canImportFrom` rules are enforced;
- cycle policy is explicit, has a temporary allowlist if necessary, and matches report/exit behavior;
- tests prove at least one allowed and forbidden edge for every layer;
- the committed/generated report cannot say `FAIL` while CI succeeds.

## Runtime ownership gaps

### Execution paths

| Path                                            | Production reachability                                               | Real work                                                          | Persistence/recovery                                                                 | Audit disposition                                |
| ----------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `planning/execution/PlanExecutor`               | Primary generation, compile, planning, v1/v2 APIs, distributed worker | Real agent execution, evaluation, retry, memory, events, artifacts | Primary generation history/artifacts persist; executor state itself is process-local | Canonical core                                   |
| `pipeline/v2/PipelineEngine`                    | Concept routes and Studio artifact consumers                          | Real agent registry calls and review/artifact semantics            | Defaults to in-memory store; file store exists but is not the default                | Retain only with explicit bounded responsibility |
| `orchestrator/AutonomousOrchestrator`           | `/api/autonomous`                                                     | Simulated waits/outputs; random playtest score                     | In-memory sessions/checkpoints                                                       | Preview until connected                          |
| `runtime/controller/RuntimeExecutionController` | Integration/jobs cluster, not server bootstrap                        | Wraps `PlanExecutor`                                               | Process-local integration path                                                       | Adopt intentionally or retire                    |
| `execution/aiPipelineIntegrator`                | Runtime import hard-banned                                            | Throws deprecation path                                            | None                                                                                 | Remove after preserved constants/types migrate   |

`PlanExecutor` exposes `ExecutionOptions.parallel`, but its loop explicitly executes ready nodes sequentially. The option is unused and should not be presented as implemented.

### Orchestration and collaboration

Three orchestration concepts coexist:

- `agents/core/AgentRegistry` plus `OrchestratorAgent` — active canonical agent composition;
- `agents/orchestrator/*` — consumed by the unbootstrapped integration manager;
- top-level `orchestrator/AutonomousOrchestrator` — mounted but simulated.

Two collaboration concepts coexist:

- `agents/collaboration/*` — mounted through `/api/agents`, with simplified/stubbed reasoning;
- top-level `collaboration/*` — isolated and coupled to top-level event sourcing.

This is not automatically duplicate code: some types have different responsibilities. It is architectural debt because ownership and lifecycle are not documented, and multiple packages present themselves as top-level orchestration/collaboration engines.

### Providers and AI

The production composition root uses:

`ai/providerFactory.ts → providers/{openai,anthropic,gemini,openrouter,ollama,groq}.ts`

The separate `providers/ai` registry/adapters are constructed only by `PlatformIntegrationManager`, which is not bootstrapped. Some of those adapters explicitly return stubs. The project should either:

- migrate their useful health/retry/normalization abstractions behind the canonical provider interface; or
- mark and remove the integration-only stack.

PromptEngine and ContextManager are real and tested. Memory is split across `ai/memory`, `memory/core`, and `memory/knowledge`; only `memory/core`/agent bridge is on the canonical `PlanExecutor` path.

## Data and durability gaps

### Confirmed durable core

When PostgreSQL is configured, migrations and cache hydration complete before listening. The audited restart test covers identities, sessions, users, projects, generation history, API keys, blueprints, blueprint versions, executions, artifacts, conversations, and messages. Primary ownership survives restart.

### Acknowledgement semantics

`PostgresStorageProvider.set/delete`:

1. mutates the in-memory cache synchronously;
2. schedules an asynchronous write;
3. returns before the write completes;
4. logs failure and marks the connection unavailable if persistence rejects.

Existing synchronous repositories cannot tell the HTTP layer whether a write reached PostgreSQL. Shutdown flush helps orderly exits but does not provide request-level durability. This is a contract gap, not evidence that the current restart test is false.

### Process-local operational state

Active process-local examples include:

- concept definitions and Pipeline v2 default store;
- planning route plans;
- simulation results;
- autonomous sessions/checkpoints;
- traces and metrics;
- user preferences, version history, team/usage/queue services in current implementations;
- several Studio/runtime maps, with only the explicitly migrated Studio command/artifact records durable.

Each must be classified as cache, ephemeral telemetry, preview state, or durable product state. Only the last category requires migration.

## Security architecture gaps

### Session terminology and response shape

`AuthService` generates random opaque tokens (`tok_...` and `ref_...`) and validates them against storage. It does not issue or cryptographically verify a JWT. Storage-backed random sessions are a valid design, but current docs/types/comments repeatedly call them JWTs.

More importantly, register/login/refresh both set httpOnly cookies and return the same reusable access and refresh values in JSON. The Frontend does not need those body fields. The hardening target is:

- cookie-only credentials for the browser contract;
- no reusable token in response bodies;
- refresh token digesting/rotation and bounded lookup;
- explicit API/Studio bearer-key contract where non-browser credentials are required;
- corrected docs/tests using “opaque session token.”

### Authorization

Production authentication and project ownership checks are real. Role/permission tables and `PermissionMiddleware` are unit-tested but never mounted on routes. Any claim of production RBAC is therefore unsupported.

### Automation

Neither repository has a protected dependency audit, SAST/CodeQL-equivalent, dependency review, image scan, or SBOM gate. Audit results at the baseline:

- backend production graph: three low advisories in the Express/body-parser chain, with no reported fix;
- backend full graph: 20 high development advisories plus the three low production advisories;
- Frontend production graph: zero advisories;
- Frontend full graph: five high development advisories in ESLint/minimatch/brace-expansion chains.

These results need policy-based triage rather than unconditional automated upgrades.

## Frontend and cross-repository gaps

The standalone Frontend has a good ownership model: one REST adapter, one Socket adapter, one Workspace read model, and no embedded-client fallback. The gaps are:

- Studio verification is discarded and forced false;
- API response types are manually redefined instead of generated/shared or schema-validated at the repository boundary;
- lint/format are not protected and currently fail substantially;
- the available 40-check production integration suite is not in CI;
- backend composed CI pins a Frontend SHA manually, so later Frontend changes do not automatically prove compatibility;
- no bundle budget catches the 593.85 kB client chunk caused by wildcard Lucide imports.

The target is a cross-repository contract gate that records both exact SHAs and runs the production auth/isolation/generation/Studio guard behavior before either release identity is promoted.

## Roblox architecture gaps

The verified command path is sound:

`canonical generation → durable execution artifacts → project-scoped command → poll → ACK → materialize → exact receipts → backend verification`

Scope boundaries that must remain explicit:

- Lua artifacts create or update native Script, LocalScript, and ModuleScript instances in supported Roblox services.
- Non-Lua artifacts become metadata `StringValue` instances under `ReplicatedStorage/AIStudioArtifacts`.
- The plugin does not currently insert real models, meshes, textures, audio, animations, or native generated GUI controls.
- The plugin does not publish a place or produce a canonical `.rbxl`.
- `RuntimeValidator.lua` exists but is explicitly excluded from the package and entrypoint.

Therefore STUDIO-1 delivery verification is complete, while “native assets/GUI/place generation” is a separate partial capability.

## Documentation architecture gaps

- 335 tracked Markdown files create competing current-state claims.
- Unsupported manual health scores (`9.2/10`, “96% debt resolved”) were not derived from executable checks.
- Current counts were stale (`576` TypeScript files and `48` subsystems versus 609 server TypeScript files and 46 real directories).
- Old docs call opaque sessions JWTs and claim SameSite Strict while code uses SameSite Lax.
- The July 13 master audit describes the removed frontend and obsolete module states.

TECH-AUDIT-2 becomes the current technical baseline. Historical reports should remain for provenance but carry a superseded banner when their title suggests authority.

## Target architecture decisions

| Decision                   | Target                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Web ownership              | Standalone `Frontend` remains the only web client.                                                                   |
| Backend composition        | `server/src/index.ts` remains the only production composition root.                                                  |
| Generation execution       | `PlanExecutor` is the core; alternate engines must have explicit non-overlapping responsibilities.                   |
| AI providers               | One provider interface/factory in production; reuse health/retry utilities behind it.                                |
| Memory                     | One documented durable memory boundary, with ephemeral context clearly separated.                                    |
| Studio                     | Preserve the verified command ledger and exact receipt contract; add asset types without creating a second protocol. |
| Architecture enforcement   | Exhaustive AST-based manifest gate with truthful exit semantics.                                                     |
| Cross-repository contracts | Exact backend/Frontend SHA pair plus production-mode contract E2E.                                                   |
| Documentation              | Project control + TECH-AUDIT-2 are current; older audits are historical.                                             |

Implementation sequencing is in [ROADMAP_v2_UPDATE.md](./ROADMAP_v2_UPDATE.md).
