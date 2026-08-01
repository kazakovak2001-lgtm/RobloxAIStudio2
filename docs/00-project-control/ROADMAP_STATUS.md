<!-- prettier-ignore-start -->

# Roadmap Status

**Last Updated:** August 1, 2026  
**Current backend release:** `release/cutover-1e-candidate@7ccc4e02ba4175318856cd14b845e4ccd4dc6057`  
**Current Frontend contents:** `kazakovak2001-lgtm/Frontend@022788ace31982e2b08ea099800de784b4dbe482`

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
| `SECURITY-2G` | Dependency, SAST, secret, image, SBOM, and RBAC control gate | High | In progress — `SECURITY-2G-B` | `DURABILITY-2E` |
| `DOC-202` | Documentation-authority inventory and deterministic guards | Medium | In progress | `SECURITY-2G` decisions |
| `STUDIO-2F` | Native assets, GUI, runtime, and place delivery | Medium | Deferred | control gates |
| `AUTONOMY-3A` | Real engine-backed autonomous phases and broader recovery | High | Deferred | control gates |
| `COLLAB-3B` | Collaborative development | Medium | Deferred | preceding gates |

## SECURITY-2G control baseline

**Status:** In progress — dependency controls slice  
**Tracker:** issue #150  
**Backend baseline:** `release/cutover-1e-candidate@1fe7683d25364465765cfde656842e7f33f96e47`  
**Frontend release contents:** `kazakovak2001-lgtm/Frontend@022788ace31982e2b08ea099800de784b4dbe482`

`SECURITY-2G-A` established the truthful policy contract. `SECURITY-2G-B` now implements production dependency audit policy, deterministic dependency-change evidence and the tracked exception registry. Existing protected CI proves compilation, linting, formatting, tests, PostgreSQL restart durability, executable release images, the exact Frontend production contract, composed HTTPS, rollback readiness and architecture/runtime/durability ownership. Those controls remain prerequisites; they do not substitute for the remaining SAST, secret, image, SBOM or authorization controls.

| Control | Current state | Owner | Enforcement point | Blocking threshold | Required evidence |
| --- | --- | --- | --- | --- | --- |
| Production dependency vulnerabilities | In progress — `SECURITY-2G-B` | Backend repository | Pull request and protected push CI | No unexpired critical or high production finding | Scanner report, lockfile identity, exception registry |
| Dependency change review | In progress — `SECURITY-2G-B` | Changed repository | Pull request CI | Deny newly introduced vulnerable or disallowed dependency changes | Dependency diff and policy result |
| SAST | Missing authoritative gate | Backend and Frontend repositories | Pull request and protected push CI | No unexpired high-confidence critical or high finding | SARIF/result identity bound to commit |
| Secret detection | Missing authoritative gate | Each repository | Pull request plus defined history boundary | No verified live secret; exceptions use fingerprints, not plaintext | Scan report and revocation evidence where applicable |
| Backend image vulnerabilities | Missing authoritative gate | Backend repository | Release-image build | No unexpired critical or high runtime-package finding | Image digest and vulnerability report |
| Frontend image vulnerabilities | Missing authoritative gate | Frontend repository and paired release | Frontend release and composed release | Same threshold as backend image | Frontend image digest and report bound to release commit |
| SBOM | Missing | Producing repository | Release-image build | SPDX or CycloneDX generated for every release image | SBOM digest, image digest and source commit |
| Application RBAC | Not yet inventoried as one authoritative matrix | Backend application | Unit, integration and contract tests | Every protected REST and Socket.IO operation has positive and negative authorization evidence | Route/event matrix and test evidence |
| Security exceptions | Implemented in `SECURITY-2G-B` | Control owner plus reviewer | Repository validation and CI | Named owner, exact scope, reason and expiry required | Tracked exception registry and expiry check |

Policy principles:

1. Evidence, not tool configuration, determines completion.
2. Reports identify the exact source commit, dependency lockfile or image digest.
3. Critical and high findings affecting shipped runtime code block by default.
4. Exceptions require an owner, technical rationale, exact scope and expiry.
5. Secret exceptions use stable fingerprints or rule/path scopes, never plaintext credentials.
6. Backend and Frontend coverage remain separate and truthful.
7. Equivalent REST and Socket.IO authority requirements require equivalent negative tests.
8. Historical secret scanning has an explicit boundary and is never silently approximated.

Ordered delivery:

- `SECURITY-2G-A — Baseline and policy contract`: establish the matrix, thresholds and evidence contract without runtime or dependency changes.
- `SECURITY-2G-B — Dependency controls`: production dependency audit, dependency review and deterministic exception registry.
- `SECURITY-2G-C — SAST and secrets`: TypeScript/JavaScript SAST, pull-request secret detection and explicit history boundary.
- `SECURITY-2G-D — Image scanning and SBOM`: scan exact backend and Frontend images and bind SBOMs to image digests and paired commits.
- `SECURITY-2G-E — RBAC and authorization parity`: route/event inventory and negative authorization evidence across REST and Socket.IO.
- `SECURITY-2G-F — Consolidated gate`: blocking merge gate, final protected evidence and documentation reconciliation.

Every exception records the control, exact package/advisory/rule/path/fingerprint/component/case, affected repository and release identity, owner, rationale, compensating control, approval reference, creation date and expiry. Expired, ambiguous, wildcard or ownerless exceptions fail validation.

Completion of `SECURITY-2G-B` does not complete `SECURITY-2G`; controls remain missing until their respective slices produce protected evidence.

## Completion evidence

- `ARCH-2B`: issue #53 closed as completed; final program merge `56f2e894699231df4219343283e23aaa9c1cab4c`.
- `FRONTEND-2C`: Frontend PRs #18–#21; canonical `Frontend/main` contents `022788ace31982e2b08ea099800de784b4dbe482`; promoted by REL-203 PR #145.
- `RUNTIME-2D`: issue #57 closed as completed; runtime ownership is protected by architecture, runtime, and memory validators.
- `DURABILITY-2E`: DATA-201 issue #63 and DATA-202 issue #135 closed; DATA-202 final slice merge `a33a8c30588f1e4705d27856e61d839c8efd42ac`.
- `SECURITY-2G-A`: issue #148 and PR #149; merged baseline commit `1fe7683d25364465765cfde656842e7f33f96e47`.
- `SECURITY-2G-B`: issue #150 and draft PR #151; dependency controls remain in progress until protected audit evidence is green.
- Active paired release: backend merge `7ccc4e02ba4175318856cd14b845e4ccd4dc6057` plus Frontend contents `022788ace31982e2b08ea099800de784b4dbe482`.

## Runtime truthfulness

Serializable pipeline, autonomous-session/checkpoint, and Studio command/verification evidence is provider-backed. Live sockets, connected clients, timers, callbacks, promises, controllers, and similar execution handles remain intentionally process-local. Completion of `DURABILITY-2E` must not be interpreted as persistence of non-serializable runtime handles.

## Frontend ownership

The canonical web application is the separate repository [`kazakovak2001-lgtm/Frontend`](https://github.com/kazakovak2001-lgtm/Frontend). The removed root `src/` application is historical and protected from reintroduction. Backend and Frontend form one paired product release through exact commit identities and the protected production contract/composed HTTPS gates.

## Current references

- [Current Project State](./CURRENT_STATE.md)
- [DOC-202A Roadmap Authority Reconciliation](./DOC-202A_ROADMAP_AUTHORITY_RECONCILIATION.md)
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
