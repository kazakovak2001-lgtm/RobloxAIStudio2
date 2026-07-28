# Roblox AI Studio Documentation

**Last updated:** July 28, 2026

This directory documents the backend, standalone Frontend boundary, Roblox Studio plugin, release evidence, and current engineering roadmap.

## Current authority

Read these documents first:

1. [Current Project State](./00-project-control/CURRENT_STATE.md) — current implementation and verification state.
2. [Roadmap Status](./00-project-control/ROADMAP_STATUS.md) — completed delivery and next ordered work.
3. [Decision Log](./00-project-control/DECISION_LOG.md) — significant architecture/product decisions.
4. [Technical Audit v2.0](./02-audits/technical-v2/EXECUTIVE_AUDIT.md) — July 28 two-repository evidence baseline.
5. [Sprint Backlog](./02-audits/technical-v2/SPRINT_BACKLOG.md) — ready implementation items.

When an older report conflicts with these sources, the current project-control documents and TECH-AUDIT-2 win.

## Repository ownership

| Surface              | Canonical location                                                              | Responsibility                                                                         |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Backend/API/runtime  | `kazakovak2001-lgtm/RobloxAIStudio2`                                            | Express, Socket.IO, AI/generation, persistence, Studio command runtime                 |
| Web application      | [`kazakovak2001-lgtm/Frontend`](https://github.com/kazakovak2001-lgtm/Frontend) | React 19/TanStack Start SSR application and Workspace                                  |
| Roblox Studio plugin | `studio-plugin/`                                                                | Project connection, command polling, artifact materialization, exact receipt reporting |

The old embedded root `src/` frontend is removed and protected by a permanent invariant guard. Do not create another web client in this repository.

## Current delivery sequence

- CUTOVER-1 and CLEANUP-1A–1D: complete.
- TECH-AUDIT-2: complete.
- HARDEN-2A: complete through SEC-201, FE-201, INT-201, and DOC-201.
- ARCH-2B: in progress; ARCH-201 AST import graph is implemented and ARCH-202
  manifest/layer enforcement is next.
- FRONTEND-2C, RUNTIME-2D, DURABILITY-2E: planned in that order.
- STUDIO-2F native asset/GUI/place expansion: optional and deferred.
- F-12 collaborative development: deferred until authorization, runtime, and durability gates pass.

See [Roadmap v2 Update](./02-audits/technical-v2/ROADMAP_v2_UPDATE.md).

## Technical Audit v2.0

The complete audit set lives in `docs/02-audits/technical-v2/`:

- [Executive Audit](./02-audits/technical-v2/EXECUTIVE_AUDIT.md)
- [Module Registry](./02-audits/technical-v2/MODULE_REGISTRY.md)
- [Feature Matrix](./02-audits/technical-v2/FEATURE_MATRIX.md)
- [Architecture Gap Report](./02-audits/technical-v2/ARCHITECTURE_GAP_REPORT.md)
- [Technical Debt](./02-audits/technical-v2/TECHNICAL_DEBT.md)
- [Roadmap v2 Update](./02-audits/technical-v2/ROADMAP_v2_UPDATE.md)
- [Sprint Backlog](./02-audits/technical-v2/SPRINT_BACKLOG.md)

## Architecture and APIs

- [Architecture overview](./ARCHITECTURE.md)
- [API reference](./API.md)
- [Architecture rules](./development/ARCHITECTURE_RULES.md)
- [Agent architecture](./AGENT_ARCHITECTURE.md)
- [Architecture Decision Records](./adr/)
- [Frontend cutover contract](./00-project-control/FRONTEND_CUTOVER.md)

TECH-AUDIT-2 records known gaps in the current architecture manifest and
boundary validator. ARCH-201 closes regex/re-export visibility with a reviewed
1,460-specification AST graph; a green boundary command is not fully
authoritative until ARCH-202 and ARCH-203 close manifest, layer, unknown-domain,
cycle, and exit-semantics gaps.

## Studio integration

- [Studio artifact lineage](./00-project-control/STUDIO-1A_ARTIFACT_LINEAGE.md)
- [Shared Studio runtime](./00-project-control/STUDIO-1B_RUNTIME_CONSOLIDATION.md)
- [Acknowledgement/result contract](./00-project-control/STUDIO-1C_IMPORT_ACKNOWLEDGEMENT.md)
- [Canonical plugin acceptance](./00-project-control/STUDIO-1D_REAL_PLUGIN_ACCEPTANCE.md)
- [Desktop package/runbook](./00-project-control/STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md)
- [Desktop findings](./00-project-control/STUDIO-1F_DESKTOP_FINDINGS_AND_RERUN.md)
- [Real desktop result](./00-project-control/STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md)
- [Plugin README](../studio-plugin/README.md)

STUDIO-1 proves exact generated-artifact delivery and verification. Native model/mesh/audio/GUI/place generation is separate future scope.

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
npm run test:workspace
npm run build
```

TECH-AUDIT-2 found that Frontend lint/format are not yet green or protected;
FRONTEND-2C owns that baseline. Production auth and ownership-isolation evidence
must use the protected 40-check contract with `NODE_ENV=production`;
development-mode auth bypass is not valid evidence.

## Documentation organization

| Directory                                   | Purpose                                             |
| ------------------------------------------- | --------------------------------------------------- |
| `00-project-control/`                       | Current state, roadmap, decisions, release evidence |
| `01-architecture/`, `architecture/`, `adr/` | Architecture and decisions                          |
| `02-audits/`                                | Current structured audits                           |
| `03-features/`                              | Feature-specific current documentation              |
| `04-migrations/completed/`                  | Completed migration evidence                        |
| `project/`, `migration/`                    | Delivery and migration records                      |
| `archive/`                                  | Historical, non-authoritative documentation         |
| `workspace-ux-redesign-v2/`                 | Historical/workstream design evidence               |

Many top-level reports are implementation-era evidence. Their dates and status banners determine whether they are current.

## Deployment

- [Production deployment guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Production deployment checklist](./PRODUCTION_DEPLOYMENT_CHECKLIST.md)
- [CUTOVER-1A backend release](./00-project-control/CUTOVER-1A_BACKEND_RELEASE_ARTIFACT.md)
- [CUTOVER-1C composed release](./00-project-control/CUTOVER-1C_COMPOSED_RELEASE.md)
- [CUTOVER-1D readiness and rollback](./00-project-control/CUTOVER-1D_RELEASE_BASELINE_READINESS.md)

The backend and Frontend release images remain independently deployable. The composed release pins exact identities and validates production REST/Socket behavior behind HTTPS.
