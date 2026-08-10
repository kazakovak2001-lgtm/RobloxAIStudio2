<!-- prettier-ignore-start -->

# Roblox AI Studio Documentation

**Last updated:** August 9, 2026

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

- Backend runtime: `release/cutover-1e-candidate@3e18460c394b03c2d373c7d1a2e9cd0b74b6f984`.
- Frontend runtime contents: `kazakovak2001-lgtm/Frontend@6c1458d836244f2b720f361a78c2ab13f1682f74`.
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
- `SECURITY-2G`, `DOC-202`, `ROADMAP-AUDIT-1`, `STUDIO-ACCEPT-1`, and `RUNTIME-PLAYTEST-1`: complete.
- `REPAIR-1`: complete — backend 1A (real single-strategy repair), 1B (Studio redelivery), and 1C (delivery/rollback audit), plus the Frontend Integrate-stage repair panel that surfaces them (Frontend PR #40).
- `PROVIDER-1A` and `PROVIDER-1B`: complete — backend PR #193 and #200. An execution now records which provider and model produced it, and every route that substitutes deterministic canned content declares itself, so an execution is reported as AI-authored only when a model authored all of it.
- `ARTIFACT-1`: code complete, not done — backend PR #199. Delivered metadata artifacts have a stable Studio identity, so re-exporting a project should replace the previous instance instead of accumulating one per run. The change is plugin Lua and there is no Lua test harness, so runtime evidence from a Studio-attached run is still outstanding.
- `SECREVIEW-1`: complete — backend PR #201. Deterministic trust-boundary review of generated Luau, recorded as a durable `SECURITY_REVIEW` artifact. It is advisory: a finding never negates generation, delivery or release, and a blocking gate is the separate `SECURITY-REVIEW-B` delivery, gated on seven [documented criteria](./00-project-control/SECURITY-REVIEW-B_PROMOTION_CRITERIA.md).
- `PIPELINE-1A`: complete — backend PR #203. The generation plan is server-owned versioned data. A request may only narrow the pipeline, never extend it; a selection that cannot run is refused before it runs rather than stranding the executor; and an execution reports as completed only work an agent actually performed, recording which pipeline definition produced it. Conditional nodes are `PIPELINE-1C` and are not yet scoped.
- `PIPELINE-1B`: complete — backend PR #205. What deterministic validation found is a durable typed artifact instead of an exception message: the playability contract stays blocking, UI materializability is advisory, and the report states its own limits so a clean result is not read as proof. The `tester` agent is deliberately not wired in — a checklist of `pending` tests recorded as a validation report reads as a clean result for work that never ran.
- `WORLD-1A`: complete — backend PR #207. A semantic world model records what a generation claims its world is for, and cross-artifact validation asks whether the generated Lua contains what each claim requires — the first check that compares two artifacts rather than checking one against itself. Claims carry roles rather than shapes, so it is not built around one gameplay template; a role nothing could settle is reported unverifiable rather than supported. Non-canonical, unmaterialized, and advisory. Materialization is `WORLD-1B`.
- `WORLD-1B`: code complete, not done — backend PR #209. The world model is materialized into Studio as real instances under `ReplicatedStorage.AIStudioArtifacts`, deliberately not `Workspace`: the playability contract makes the generated server script the owner of the runtime world, so a scene graph placed there would be a second world. No script class or Source property can be expressed through the contract. Contract tested; operator-observed Studio acceptance is outstanding. Canonical ownership is `WORLD-1C`, which requires observed `WORLD-1B` evidence rather than `STUDIO-2F-E` — the HUD contract is a separate concern that `WORLD-1C` leaves untouched.
- `AGENT-CONTRACT-1`: complete — backend PR #212. Every runtime agent has one versioned, server-owned definition stating what it produces, whether deterministic fallback content may satisfy it, and how many attempts it makes. No policy field was added that nothing reads — `title` is carried as a human-readable label and is not claimed otherwise: a definition that requires a model refuses to run without one, an agent that forbids fallback fails rather than passing canned content on, the pipeline rejects a node naming an agent that is undefined or not pipeline-reachable, and `npm run validate` fails on any drift between the definitions and the running registry. Timeout, monetary cost and input-token ceilings are recorded as gaps rather than declared, because nothing enforces them today. Foundation only — no new agents, no substitution, no model routing.
- `SECURITY-REVIEW-A2`: complete — backend PR #216. The advisory Luau reviewer can no longer report a pass over code it never read: it distinguishes `pass`, `finding`, `not_applicable` and `not_inspected`, records the content hash of every script it reviewed so a stale report is detectable, and reports a line and the matching source on every finding. Rules were added for RemoteFunction handlers, runtime code compilation, client-chosen player identity and client-chosen HTTP targets. It stays advisory — a finding still never negates generation, delivery or release.
- `ARTIFACT-CONTRACT-2`: complete — backend PR #214. Every durable artifact a run produces now carries its own schema version, owning project, canonical content hash and producer identity, plus dependency lineage wherever it was derived from an upstream artifact, so a validation or security report identifies the exact content it read instead of being assumed to still describe whatever is there now. Repairing a game no longer carries a review of the old Lua onto the new Lua. Historical artifacts carry no envelope, are held to none, and are never assigned metadata they never had; no database migration was required.
- `STUDIO-2F`: decomposed into `STUDIO-2F-A`…`STUDIO-2F-E`. No unsatisfied control gate remains. `STUDIO-2F-A` (generated GUI materialization) is code complete through backend PR #195/#196/#197 but not done — runtime validation is outstanding, so it does not yet satisfy the dependency for the rest, which are named for ordering only.
- `AUTONOMY-3A`: deferred and unscoped.

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

STUDIO-1 proves exact generated-artifact delivery and verification. DATA-202C persists serializable Studio command and verification evidence. Live clients, sockets, timers, and callbacks remain intentionally process-local. Native model, mesh, audio, GUI, runtime, and place generation is separate `STUDIO-2F` scope, now decomposed into sub-phases; GUI materialization is scoped as `STUDIO-2F-A` and the rest remain unscoped.

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
