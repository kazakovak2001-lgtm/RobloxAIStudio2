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
| `SECURITY-2G` | Dependency, SAST, secret, image, SBOM, and RBAC control gate | High | **In progress — SECURITY-2G-A** | `DURABILITY-2E` |
| `DOC-202` | Documentation-authority inventory and deterministic guards | Medium | In progress | `SECURITY-2G` decisions |
| `STUDIO-2F` | Native assets, GUI, runtime, and place delivery | Medium | Deferred | control gates |
| `AUTONOMY-3A` | Real engine-backed autonomous phases and broader recovery | High | Deferred | control gates |
| `COLLAB-3B` | Collaborative development | Medium | Deferred | preceding gates |

## Completion evidence

- `ARCH-2B`: issue #53 closed as completed; final program merge `56f2e894699231df4219343283e23aaa9c1cab4c`.
- `FRONTEND-2C`: Frontend PRs #18–#21; canonical `Frontend/main` contents `022788ace31982e2b08ea099800de784b4dbe482`; promoted by REL-203 PR #145.
- `RUNTIME-2D`: issue #57 closed as completed; runtime ownership is protected by architecture, runtime, and memory validators.
- `DURABILITY-2E`: DATA-201 issue #63 and DATA-202 issue #135 closed; DATA-202 final slice merge `a33a8c30588f1e4705d27856e61d839c8efd42ac`.
- Active paired release: backend merge `7ccc4e02ba4175318856cd14b845e4ccd4dc6057` plus Frontend contents `022788ace31982e2b08ea099800de784b4dbe482`.

## Runtime truthfulness

Serializable pipeline, autonomous-session/checkpoint, and Studio command/verification evidence is provider-backed. Live sockets, connected clients, timers, callbacks, promises, controllers, and similar execution handles remain intentionally process-local. Completion of `DURABILITY-2E` must not be interpreted as persistence of non-serializable runtime handles.

## Frontend ownership

The canonical web application is the separate repository [`kazakovak2001-lgtm/Frontend`](https://github.com/kazakovak2001-lgtm/Frontend). The removed root `src/` application is historical and protected from reintroduction. Backend and Frontend form one paired product release through exact commit identities and the protected production contract/composed HTTPS gates.

## Current references

- [Current Project State](./CURRENT_STATE.md)
- [DOC-202A Roadmap Authority Reconciliation](./DOC-202A_ROADMAP_AUTHORITY_RECONCILIATION.md)
- [SECURITY-2G Control Baseline](./SECURITY-2G_CONTROL_BASELINE.md)
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
