<!-- prettier-ignore-start -->

# Roadmap Status

**Last Updated:** August 8, 2026 (PROVIDER-1A implemented, unmerged)
**Current backend runtime release:** `release/cutover-1e-candidate@ccd28ef816d1653df0aebd0775f70187aa321564`
**Current Frontend runtime contents:** `kazakovak2001-lgtm/Frontend@6c1458d836244f2b720f361a78c2ab13f1682f74`

This file is the ordered current delivery authority. The dated TECH-AUDIT-2 roadmap and sprint backlog are historical planning baselines and do not override the status below. See [DOC-202A reconciliation](./DOC-202A_ROADMAP_AUTHORITY_RECONCILIATION.md) for exact completion evidence.

## Current delivery sequence

| ID | Delivery item | Priority | Status | Dependency |
| --- | --- | --- | --- | --- |
| `CUTOVER-0` | Standalone Frontend governance and CI alignment | Critical | ✅ Complete | — |
| `CI-BASELINE-1` | Portable backend CI and repository hygiene | Critical | ✅ Complete | `CUTOVER-0` |
| `CORE-1` | Durable project data and API contract stabilization | Critical | ✅ Complete | `CI-BASELINE-1` |
| `WORKSPACE-1` | Workflow-oriented standalone Frontend Workspace | High | ✅ Complete | `CORE-1` |
| `STUDIO-1` | Generated artifact to Roblox Studio verification | High | ✅ Complete | `CORE-1`, `WORKSPACE-1` |
| `CUTOVER-1` | Release promotion and embedded frontend removal | High | ✅ Complete | `WORKSPACE-1`, `STUDIO-1` |
| `TECH-AUDIT-2` | Two-repository evidence baseline | Critical | ✅ Complete — historical baseline | `CUTOVER-1` |
| `HARDEN-2A` | Auth, Studio-state, and cross-repository contract correctness | Critical | ✅ Complete | `TECH-AUDIT-2` |
| `ARCH-2B` | Exhaustive truthful architecture boundary gate | Critical | ✅ Complete | `HARDEN-2A` |
| `FRONTEND-2C` | Protected Frontend quality and bundle baseline | High | ✅ Complete | `HARDEN-2A` |
| `RUNTIME-2D` | Runtime/provider/orchestration/memory ownership | High | ✅ Complete | `ARCH-2B` |
| `DURABILITY-2E` | Durable writes and operational-state truthfulness | High | ✅ Complete | `RUNTIME-2D` |
| `SECURITY-2G` | Dependency, SAST, credential, image, SBOM, and RBAC control gate | High | ✅ Complete — `SECURITY-2G-F` | `DURABILITY-2E` |
| `DOC-202` | Documentation-authority inventory and deterministic guards | Medium | ✅ Complete — `DOC-202A` | `SECURITY-2G` |
| `ROADMAP-AUDIT-1` | Evidence-based next-phase reconciliation | High | ✅ Complete | `DOC-202` |
| `STUDIO-ACCEPT-1` | Real Studio acceptance of canonical artifact delivery | Critical | ✅ Complete | `ROADMAP-AUDIT-1` |
| `RUNTIME-PLAYTEST-1` | Authoritative Studio-attached Roblox runtime evidence | High | ✅ Complete — [result](./RUNTIME-PLAYTEST-1_RESULT.md), operator-observed evidence | `STUDIO-ACCEPT-1` |
| `REPAIR-1` | Artifact-applying repair, redelivery, and revalidation | High | ✅ Complete — backend 1A/1B/1C plus the Frontend repair UI (backend PR #185/#187/#189, Frontend PR #38/#40) | `RUNTIME-PLAYTEST-1` |
| `PROVIDER-1A` | Truthful AI provider configuration and generation provenance | High | ✅ Implemented — awaiting reviewed merge | `REPAIR-1` |
| `STUDIO-SYNC-1A` | Project sync and artifact-transfer contract hardening | Medium | ✅ Complete — backend PR #176, Frontend PR #34/#37 | `STUDIO-ACCEPT-1` |
| `STUDIO-2F` | Native assets, GUI, runtime, and place delivery | Medium | Deferred | control gates |
| `AUTONOMY-3A` | Real engine-backed autonomous phases and broader recovery | High | Deferred | control gates |
| `COLLAB-3B` | Collaborative development | Medium | Deferred | preceding gates |

## SECURITY-2G control baseline

- **Status:** Complete — merged through PR #162
- **Tracker:** issue #161 and PR #162
- **Backend baseline:** `release/cutover-1e-candidate@da55f716c798ec8c6a7f25a8e2a3b7b0a2244416`
- **Frontend release contents:** `kazakovak2001-lgtm/Frontend@e89f93d88a3c181b65769641e1a586c86827a6c5`

`SECURITY-2G-A` established the truthful policy contract. `SECURITY-2G-B` completed production dependency controls. `SECURITY-2G-C` completed backend CodeQL and Gitleaks evidence. `SECURITY-2G-D` completed exact backend and paired Frontend runtime-image scanning, digest-bound SPDX SBOM evidence, deterministic policy validation and hardened runtime images with npm removed from final stages. `SECURITY-2G-E` completed the generated 204-operation REST and Socket authorization matrix, API-key capability/resource-scope enforcement and positive/negative parity evidence. `SECURITY-2G-F` now consolidates dependency, SAST, credential, image, SBOM, RBAC, 40-check production-contract and composed HTTPS release evidence into one deterministic fail-closed gate with positive and negative fixtures.

| Control | Current state | Owner | Enforcement point | Blocking threshold | Required evidence |
| --- | --- | --- | --- | --- | --- |
| Production dependency vulnerabilities | Implemented in `SECURITY-2G-B` | Backend repository | Pull request and protected push CI | No unexpired critical or high production finding | Scanner report, lockfile identity, exception registry |
| Dependency change review | Implemented in `SECURITY-2G-B` | Changed repository | Pull request CI | Deny newly introduced vulnerable or disallowed dependency changes | Dependency diff and policy result |
| Backend SAST | Implemented in `SECURITY-2G-C` | Backend repository | Pull request and protected push security workflow | No unexpired high-confidence critical or high finding | CodeQL result identity and artifact bound to source commit |
| Backend credential detection | Implemented in `SECURITY-2G-C` | Backend repository | Pull request plus explicit history boundary | No verified live credential; exceptions use exact fingerprints, not plaintext | Redacted changed-content and bounded-history reports |
| Frontend SAST and credential detection | Tracked as separate Frontend-owned follow-up; paired release credential/image evidence remains exact-commit bound | Frontend repository | Frontend pull request and protected push CI | Same policy thresholds as backend | Frontend-owned scanner evidence bound to Frontend commit |
| Backend image vulnerabilities | Implemented in `SECURITY-2G-D` | Backend repository | Exact release-image build | No unexpired critical or high fixed runtime-package finding | Image digest, Trivy report and source commit |
| Frontend image vulnerabilities | Implemented for the paired release in `SECURITY-2G-D` | Backend release integration over exact Frontend commit | Paired release-image build | Same threshold as backend image | Frontend image digest and report bound to exact Frontend commit |
| SBOM | Implemented in `SECURITY-2G-D` for both paired release images | Backend release integration | Exact release-image build | SPDX JSON generated and policy-validated for every paired release image | SPDX document, image digest and paired source commits |
| Application RBAC | Implemented and merged through PR #157 | Backend application | Generated authorization matrix plus unit, integration and contract tests | Every protected REST and Socket.IO operation has classification, capability, resource scope and positive/negative evidence | 204-operation route/event matrix, 50 SECURITY-2G-E test files, 137 passing tests |
| Security exceptions | Implemented in `SECURITY-2G-B` and extended in `SECURITY-2G-C` | Control owner plus reviewer | Repository validation and CI | Named owner, exact scope, reason and expiry required | Tracked exception registry and expiry check |

Policy principles:

1. Evidence, not tool configuration, determines completion.
2. Reports identify the exact source commit, dependency lockfile or image digest.
3. Critical and high findings affecting shipped runtime code block by default.
4. Exceptions require an owner, technical rationale, exact scope and expiry.
5. Credential exceptions use stable fingerprints or rule/path scopes, never plaintext credentials.
6. Backend and Frontend coverage remain separate and truthful.
7. Equivalent REST and Socket.IO authority requirements require equivalent negative tests.
8. Historical credential scanning has an explicit boundary and is never silently approximated.

Ordered delivery:

- `SECURITY-2G-A — Baseline and policy contract`: establish the matrix, thresholds and evidence contract without runtime or dependency changes.
- `SECURITY-2G-B — Dependency controls`: production dependency audit, dependency review and deterministic exception registry.
- `SECURITY-2G-C — SAST and credentials`: TypeScript/JavaScript SAST, pull-request credential detection and explicit history boundary.
- `SECURITY-2G-D — Image scanning and SBOM`: scan exact backend and Frontend images and bind SBOMs to image digests and paired commits.
- `SECURITY-2G-E — RBAC and authorization parity`: route/event inventory and negative authorization evidence across REST and Socket.IO.
- `SECURITY-2G-F — Consolidated gate`: blocking merge gate, final protected evidence and documentation reconciliation.

Every exception records the control, exact package/advisory/rule/path/fingerprint/component/case, affected repository and release identity, owner, rationale, compensating control, approval reference, creation date and expiry. Expired, ambiguous, wildcard or ownerless exceptions fail validation.

`SECURITY-2G` is complete through merged PR #162 at `da55f716c798ec8c6a7f25a8e2a3b7b0a2244416`. `DOC-202A`, ROADMAP-AUDIT-1, STUDIO-ACCEPT-1, RUNTIME-PLAYTEST-1, and `REPAIR-1` are complete. `PROVIDER-1A` is implemented and awaiting reviewed merge; it does not yet advance the runtime pair. `REPAIR-1` landed all three backend sub-phases — 1A (real artifact-applying single-strategy repair), 1B (Studio redelivery of repaired artifacts), and 1C (durable delivery/rollback audit trail) — plus the Frontend repair UI that surfaces them (Frontend PR #40). Native delivery, autonomy, collaboration, and lower-priority sync hardening remain separate subsequent deliveries.

## Completion evidence

- `ARCH-2B`: issue #53 closed as completed; final program merge `56f2e894699231df4219343283e23aaa9c1cab4c`.
- `FRONTEND-2C`: Frontend PRs #18–#21; canonical `Frontend/main` contents `022788ace31982e2b08ea099800de784b4dbe482`; promoted by REL-203 PR #145.
- `RUNTIME-2D`: issue #57 closed as completed; runtime ownership is protected by architecture, runtime, and memory validators.
- `DURABILITY-2E`: DATA-201 issue #63 and DATA-202 issue #135 closed; DATA-202 final slice merge `a33a8c30588f1e4705d27856e61d839c8efd42ac`.
- `SECURITY-2G-A`: issue #148 and PR #149; reviewed head `15261bea2a63ff574a2f8f33b93cfec53f5ecec6`; merged baseline commit `1fe7683d25364465765cfde656842e7f33f96e47`.
- `SECURITY-2G-B`: issue #150 and PR #151; reviewed head `ccb65bfc7c906f43634aab587f492d5a67179a41`; merged dependency-control commit `8dd23f88a0b23e2eedf5f2c38a36f0c12570cbab`.
- `SECURITY-2G-C`: issue #152 and PR #153; reviewed head `60b184a645e06f57d0ac53d3bf67a968a5e7b647`; merged commit `76f4e7a7be1684ac7984533d6c8d698ba6c99e7e`.
- `SECURITY-2G-D`: issue #154 and PR #155; merged commit `d55fdb4d7eb920d0271d1ee7affe08666cdb270a`; exact paired runtime-image scanning, digest-bound SPDX SBOM evidence and deterministic image policy validation are complete.
- `SECURITY-2G-E`: issue #156 and PR #157; merged commit `29bcd8ed53f9e86f41e753f305ad952c0dbc1de5`; generated authorization matrix contains 204 classified operations, all 26 API-key eligible operations enforce explicit capabilities and resource scopes, and Socket.IO `project:join` and `project:leave` have positive and negative parity evidence.
- `SECURITY-2G-F`: issue #161 and PR #162; squash merge `da55f716c798ec8c6a7f25a8e2a3b7b0a2244416`; deterministic consolidated manifest and validator bind dependency, CodeQL, credential, image, SBOM, RBAC, production-contract and composed-release evidence; negative fixtures reject missing, stale, wildcard, unowned and unbound evidence.
- `DOC-202A`: issue #163 and PR #164 established the documentation-authority inventory and fail-closed validator.
- `ROADMAP-AUDIT-1`: issue #169 ranked real Studio acceptance, authoritative runtime playtest, and artifact-applying repair as the remaining product-critical dependency chain.
- `STUDIO-ACCEPT-1`: issue #170 and [desktop acceptance evidence](./STUDIO-ACCEPT-1_DESKTOP_ACCEPTANCE_RESULT.md) bind backend `3230d2368ed781043fe9f3520c0d3de3836ec3bb`, package SHA-256 `86e102b663d48925f9e313248761bb2d91d7e0794252f6c04e50496d8ba05696`, execution `exec-1785976885787`, command `cmd-eef6e7bd-a`, eight exact receipts, real Studio hierarchy, plugin `Verified`, and backend `artifactVerified=true`.
- `REPAIR-1B`: backend PR #187 merged `6ec42d55a74bab0a9001d7e66c02795f01b41886`; adds `POST /api/repair/:projectId/deliver`, resolving the latest repaired execution server-side and reusing the existing Studio sync pipeline unchanged. Backend-only — no Frontend or Studio plugin changes required.
- `REPAIR-1C`: backend PR #189 merged `558f9e6f5cc80e3ae9e29cafdd15ce6a33addd0f`; adds a durable delivery/rollback audit trail (`RepairDeliveryRecord[]`), an optional project-validated `executionId` on `/deliver` for explicit rollback, and `GET /:projectId/deliveries`. Backend-only.
- `REPAIR-1` Frontend UI: Frontend PR #40 merged `6c1458d836244f2b720f361a78c2ab13f1682f74`; adds the Integrate-stage repair panel that runs a repair against the latest execution, redelivers it to a connected Studio session, rolls back to a project-validated earlier execution, and reads the delivery audit trail. It also repaired a stale client contract: the previous generic repair call predated REPAIR-1A and omitted the `executionId` the merged route requires. Verified by contract, parser, type and build checks; no live Studio-attached end-to-end run was performed for the UI itself.
- `PROVIDER-1A`: implemented on branch `claude/robloxaistudio2-audit-ebc9c8`; not yet merged, so the runtime pair below is unchanged. Closes three composing defects that together let a misconfigured deployment present canned content as an AI generation: `LLMProviderFactory.createByName()` had no `ollama` or `openrouter` branch and silently returned `provider: null`; every agent then fell through to its deterministic fallback; and `LuaGeneratorAgent`'s fallback is a complete hardcoded game written to satisfy the playability contract, so it passed validation, reached Studio and was scored. Explicit provider requests now resolve or fail visibly (`requested` / `unsatisfied`), `REQUIRE_LLM_PROVIDER=true` makes an unsatisfiable request a startup refusal, and every execution durably records `ai_mode` / `ai_provider` / `ai_model`, failing safe to `fallback` unless a provider resolved and no stage returned canned content. Evidence limits, stated plainly: verified by typecheck, architecture and boundary gates, 1051 passing backend tests and 24 provider-selection plus 5 provenance tests; no Studio-attached live run of a provider-backed generation was performed for this slice, and the auto-detection path still defaults to the hardcoded `llama3` model, which is recorded as remaining debt rather than silently changed.
- Active paired runtime baseline: backend `ccd28ef816d1653df0aebd0775f70187aa321564` plus protected Frontend contents `6c1458d836244f2b720f361a78c2ab13f1682f74`. Control-only reconciliation commits may follow these runtime identities; release evidence remains bound to this exact executable pair.

## Runtime truthfulness

Serializable pipeline, autonomous-session/checkpoint, and Studio command/verification evidence is provider-backed. Live sockets, connected clients, timers, callbacks, promises, controllers, and similar execution handles remain intentionally process-local. Completion of `DURABILITY-2E` must not be interpreted as persistence of non-serializable runtime handles.

## Frontend ownership

The canonical web application is the separate repository [`kazakovak2001-lgtm/Frontend`](https://github.com/kazakovak2001-lgtm/Frontend). The removed root `src/` application is historical and protected from reintroduction. Backend and Frontend form one paired product release through exact commit identities and the protected production contract/composed HTTPS gates.

## Current references

- [Current Project State](./CURRENT_STATE.md)
- [DOC-202A Roadmap Authority Reconciliation](./DOC-202A_ROADMAP_AUTHORITY_RECONCILIATION.md)
- [STUDIO-ACCEPT-1 Desktop Acceptance Result](./STUDIO-ACCEPT-1_DESKTOP_ACCEPTANCE_RESULT.md)
- [Frontend Cutover Contract](./FRONTEND_CUTOVER.md)
- [CUTOVER-1E Default Promotion](../project/CUTOVER-1E_DEFAULT_PROMOTION.md)
- [CUTOVER-1F Post-Promotion CI Alignment](../project/CUTOVER-1F_POST_PROMOTION_CI_ALIGNMENT.md)

## Historical planning references

The following documents preserve the dated TECH-AUDIT-2 planning baseline. Their former ordering and status labels are historical only:

- [TECH-AUDIT-2 Roadmap v2 Update](../02-audits/technical-v2/ROADMAP_v2_UPDATE.md)
- [TECH-AUDIT-2 Sprint Backlog](../02-audits/technical-v2/SPRINT_BACKLOG.md)
- [TECH-AUDIT-2 Executive Audit](../02-audits/technical-v2/EXECUTIVE_AUDIT.md)

When a historical audit conflicts with this file or the DOC-202A reconciliation record, the current project-control documents win.

<!-- prettier-ignore-end -->
