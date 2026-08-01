<!-- prettier-ignore-start -->

# Roblox AI Studio Documentation

**Last updated:** August 1, 2026

This directory documents the backend, standalone Frontend boundary, Roblox Studio plugin, release evidence, and current engineering roadmap.

## Current authority

Read these documents first, in this order:

1. [Current Project State](./00-project-control/CURRENT_STATE.md) — current implementation and release facts.
2. [Roadmap Status](./00-project-control/ROADMAP_STATUS.md) — exact completion evidence, ordered current delivery status, and the transition to `SECURITY-2G`.
3. [Decision Log](./00-project-control/DECISION_LOG.md) — significant architecture and product decisions.
4. [Technical Audit v2.0](./02-audits/technical-v2/EXECUTIVE_AUDIT.md) — dated July 28 two-repository evidence baseline.

When an older report conflicts with the current project-control documents, the project-control documents win. The TECH-AUDIT-2 roadmap and sprint backlog are historical planning baselines, not current execution authority.

## Repository ownership

| Surface | Canonical location | Responsibility |
| --- | --- | --- |
| Backend/API/runtime | `kazakovak2001-lgtm/RobloxAIStudio2` | Express, Socket.IO, AI/generation, persistence, Studio command runtime |
| Web application | [`kazakovak2001-lgtm/Frontend`](https://github.com/kazakovak2001-lgtm/Frontend) | React 19/TanStack SSR application and Workspace |
| Roblox Studio plugin | `studio-plugin/` | Project connection, command polling, artifact materialization, exact receipt reporting |

The old embedded root `src/` frontend is removed and protected by a permanent invariant guard. Do not create another web client in this repository. All new user-facing web work belongs in the standalone `Frontend` repository.

## Active paired release

- Backend: `release/cutover-1e-candidate@7ccc4e02ba4175318856cd14b845e4ccd4dc6057`.
- Frontend contents: `kazakovak2001-lgtm/Frontend@022788ace31982e2b08ea099800de784b4dbe482`.
- Pairing authority: protected Frontend Production Contract, Composed HTTPS Release, promoted-baseline integrity, and Merge Gate evidence.
- No external production deployment is claimed by repository release evidence alone.

## Current delivery sequence

- `CUTOVER-1` and `CLEANUP-1A`–`CLEANUP-1D`: complete.
- `TECH-AUDIT-2`: complete as a dated historical evidence baseline.
- `HARDEN-2A`: complete through SEC-201, FE-201, INT-201, and DOC-201.
- `ARCH-2B`: complete through issue #53 and the protected architecture program.
- `FRONTEND-2C`: complete through Frontend PRs #18–#21 and REL-203 release-pair promotion.
- `RUNTIME-2D`: complete through issue #57 and deterministic runtime ownership validation.
- `DURABILITY-2E`: complete through DATA-201 and DATA-202; issue #135 is closed.
- `SECURITY-2G`: next uncompleted control gate.
- `DOC-202`: in progress; DOC-202A reconciles current authority but does not claim the full inventory is complete.
- `STUDIO-2F` and `AUTONOMY-3A`: deferred.

See [Roadmap Status](./00-project-control/ROADMAP_STATUS.md) for exact ordering and evidence.

## Historical TECH-AUDIT-2 planning files

The following files preserve the July 28 audit-era plan. Status labels such as `ARCH-2B: Next`, `RUNTIME-2D: Planned`, or `DURABILITY-2E: In progress` are historical and must not be copied into current project-control documents:

- [Executive Audit](./02-audits/technical-v2/EXECUTIVE_AUDIT.md)
- [Module Registry](./02-audits/technical-v2/MODULE_REGISTRY.md)
- [Feature Matrix](./02-audits/technical-v2/FEATURE_MATRIX.md)
- [Architecture Gap Report](./02-audits/technical-v2/ARCHITECTURE_GAP_REPORT.md)
- [Technical Debt](./02-audits/technical-v2/TECHNICAL_DEBT.md)
- [Roadmap v2 Update](./02-audits/technical-v2/ROADMAP_v2_UPDATE.md)
- [Sprint Backlog](./02-audits/technical-v2/SPRINT_BACKLOG.md)

The audit remains useful as dated evidence and rationale. It no longer defines the current next gate.

## Architecture and APIs

- [Architecture overview](./ARCHITECTURE.md)
- [API reference](./API.md)
- [Architecture rules](./development/ARCHITECTURE_RULES.md)
- [Agent architecture](./AGENT_ARCHITECTURE.md)
- [Architecture Decision Records](./adr/)
- [Frontend cutover contract](./00-project-control/FRONTEND_CUTOVER.md)

The architecture boundary program is complete. Current validation must fail closed on unmodeled subsystems, forbidden dependencies, invalid ownership, or stale deterministic inventories.

## Studio integration

- [Studio artifact lineage](./00-project-control/STUDIO-1A_ARTIFACT_LINEAGE.md)
- [Shared Studio runtime](./00-project-control/STUDIO-1B_RUNTIME_CONSOLIDATION.md)
- [Acknowledgement/result contract](./00-project-control/STUDIO-1C_IMPORT_ACKNOWLEDGEMENT.md)
- [Canonical plugin acceptance](./00-project-control/STUDIO-1D_REAL_PLUGIN_ACCEPTANCE.md)
- [Desktop package/runbook](./00-project-control/STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md)
- [Desktop findings](./00-project-control/STUDIO-1F_DESKTOP_FINDINGS_AND_RERUN.md)
- [Real desktop result](./00-project-control/STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md)
- [Plugin README](../studio-plugin/README.md)

STUDIO-1 proves exact generated-artifact delivery and verification. DATA-202C persists serializable Studio command and verification evidence. Live clients, sockets, timers, and callbacks remain intentionally process-local. Native model, mesh, audio, GUI, runtime, and place generation is separate deferred `STUDIO-2F` scope.

## Development and validation

Use [the implementation task template](./templates/IMPLEMENTATION_TASK_TEMPLATE.md) and [development workflow](./development/DEVELOPMENT_WORKFLOW.md).

Backend baseline:

```bash
npm ci
npm run ci
npm run build
```

Studio package:

```bash
npm run studio:package
```

Standalone Frontend commands run in the separate Frontend repository:

```bash
npm ci
npx tsc --noEmit
npm run lint
npm run format:check
npm run test:workspace
npm run build
```

Production auth, ownership-isolation, and cross-repository evidence must use the protected production contract. Development-mode auth bypass is not valid evidence.

## Documentation organization

| Directory | Purpose |
| --- | --- |
| `00-project-control/` | Current state, roadmap, decisions, release evidence |
| `01-architecture/`, `architecture/`, `adr/` | Architecture and decisions |
| `02-audits/` | Dated structured audits and historical planning baselines |
| `03-features/` | Feature-specific current documentation |
| `04-migrations/completed/` | Completed migration evidence |
| `project/`, `migration/` | Delivery and migration records |
| `archive/` | Historical, non-authoritative documentation |
| `workspace-ux-redesign-v2/` | Historical/workstream design evidence |

Many reports are implementation-era evidence. Their date and authority banner determine whether they are current.

## Deployment

- [Production deployment guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Production deployment checklist](./PRODUCTION_DEPLOYMENT_CHECKLIST.md)
- [CUTOVER-1A backend release](./00-project-control/CUTOVER-1A_BACKEND_RELEASE_ARTIFACT.md)
- [CUTOVER-1C composed release](./00-project-control/CUTOVER-1C_COMPOSED_RELEASE.md)
- [CUTOVER-1D readiness and rollback](./00-project-control/CUTOVER-1D_RELEASE_BASELINE_READINESS.md)

The backend and Frontend release images remain independently deployable. The composed release pins exact identities and validates production REST and Socket.IO behavior behind HTTPS.

<!-- prettier-ignore-end -->
