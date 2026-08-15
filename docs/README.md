<!-- prettier-ignore-start -->

# Roblox AI Studio Documentation

**Last updated:** August 12, 2026

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

- Backend runtime: `release/cutover-1e-candidate@77976a7818695cfdccdea253794acc0cd3c79b91`.
- Frontend runtime contents: `kazakovak2001-lgtm/Frontend@b91ebdba613ca0d8f01a5fb33de355ae97588601`.
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
- `PLAYTEST-TRUTH-1`: complete — backend PR #229 with Frontend PR #47 and #48. `PlaytestEngine` averaged six numbers into an `overallScore` and labelled anything above eighty `production_ready`; one of the six started at eighty and added five points when the generated source contained the substring `pcall`, and nothing in that pipeline has ever run a Roblox play session. The findings are real and are kept; the arithmetic on top of them is gone. A report now states what produced it — `evidenceKind: "static-analysis"` — and states that runtime quality was **not measured** rather than omitting it or recording a zero, a terminal session reports `qualityScore: null`, and repair decides on outstanding findings instead of comparing that number to a target. A legacy score persisted before the slice is demoted to historical evidence on read rather than republished, storage decoding refuses a structurally incomplete report, and legacy repair rows are typed apart so an absence of findings never reads as zero findings. **This removes a fabricated measurement and adds no capability**: nothing runs a play session, observes a player, simulates input or measures anything at runtime, `performance` stays an estimate with nothing timed, and `PLAYTEST-2` is untouched and remains `unscoped`.
- `SIM-TRUTH-1`: complete — backend PR #231. The second fabricated score, in the simulation path `PLAYTEST-TRUTH-1` recorded and did not fix. `engagementScore` weighted four values from a tick-driven script, two of which were the same quantity counted twice, `engaged` was initialised to `true`, and a blueprint with no NPCs scored full marks for interacting with nothing; blueprints were also penalised for the simulator's own stride, which cannot reach every mechanic or NPC for certain counts. Simulation evidence is now separated into observed facts, derived indicators and an explicit `player: { status: "not-observed" }` statement that no player was observed; there is no aggregate score and no grade under any name; a shortfall the schedule caused is attributed to the schedule rather than to the blueprint; and `/lifecycle/tick` keeps caller values as client claims, leaves missing evidence missing, and abstains instead of fabricating health or evolution. **No real player engagement, retention, fun, quality or runtime measurement is claimed.** Known limitation: no server-owned simulation, economy or world evidence source is wired to `/lifecycle/tick`, so as of August 12, 2026 it cannot progress a game, and reports that explicitly.
- `PROVIDER-1A` and `PROVIDER-1B`: complete — backend PR #193 and #200. An execution now records which provider and model produced it, and every route that substitutes deterministic canned content declares itself, so an execution is reported as AI-authored only when a model authored all of it.
- `ARTIFACT-1`: complete — backend PR #199 plus repeat authenticated Studio export and real-engine idempotence evidence recorded in the [deferred Studio acceptance result](./00-project-control/STUDIO-DEFERRED-ACCEPTANCE_RESULT.md).
- `SECREVIEW-1`: complete — backend PR #201. Deterministic trust-boundary review of generated Luau, recorded as a durable `SECURITY_REVIEW` artifact. It is advisory: a finding never negates generation, delivery or release, and a blocking gate is the separate `SECURITY-REVIEW-B` delivery, gated on seven [documented criteria](./00-project-control/SECURITY-REVIEW-B_PROMOTION_CRITERIA.md).
- `PIPELINE-1A`: complete — backend PR #203. The generation plan is server-owned versioned data. A request may only narrow the pipeline, never extend it; a selection that cannot run is refused before it runs rather than stranding the executor; and an execution reports as completed only work an agent actually performed, recording which pipeline definition produced it. Conditional nodes are `PIPELINE-1C` and are not yet scoped.
- `PIPELINE-1B`: complete — backend PR #205. What deterministic validation found is a durable typed artifact instead of an exception message: the playability contract stays blocking, UI materializability is advisory, and the report states its own limits so a clean result is not read as proof. The `tester` agent is deliberately not wired in — a checklist of `pending` tests recorded as a validation report reads as a clean result for work that never ran.
- `WORLD-1A`: complete — backend PR #207. A semantic world model records what a generation claims its world is for, and cross-artifact validation asks whether the generated Lua contains what each claim requires — the first check that compares two artifacts rather than checking one against itself. Claims carry roles rather than shapes, so it is not built around one gameplay template; a role nothing could settle is reported unverifiable rather than supported. Non-canonical, unmaterialized, and advisory. Materialization is `WORLD-1B`.
- `WORLD-1B`: code complete, evidence pending — backend PR #209. Real Studio materialization, semantic attributes, repeat export, creator preservation, fail-closed collision and separation from the Lua-owned Play world passed. One explicit criterion remains: deliver a changed design and observe a disappeared managed entity being swept. See the [deferred Studio acceptance result](./00-project-control/STUDIO-DEFERRED-ACCEPTANCE_RESULT.md). `WORLD-1C` remains blocked.
- `AGENT-CONTRACT-1`: complete — backend PR #212. Every runtime agent has one versioned, server-owned definition stating what it produces, whether deterministic fallback content may satisfy it, and how many attempts it makes. No policy field was added that nothing reads — `title` is carried as a human-readable label and is not claimed otherwise: a definition that requires a model refuses to run without one, an agent that forbids fallback fails rather than passing canned content on, the pipeline rejects a node naming an agent that is undefined or not pipeline-reachable, and `npm run validate` fails on any drift between the definitions and the running registry. Timeout, monetary cost and input-token ceilings are recorded as gaps rather than declared, because nothing enforces them today. Foundation only — no new agents, no substitution, no model routing.
- `ARTIFACT-CONTRACT-2`: complete — backend PR #214. Every durable artifact a run produces now carries its own schema version, owning project, canonical content hash and producer identity, plus dependency lineage wherever it was derived from an upstream artifact, so a validation or security report identifies the exact content it read instead of being assumed to still describe whatever is there now. Repairing a game no longer carries a review of the old Lua onto the new Lua. Historical artifacts carry no envelope, are held to none, and are never assigned metadata they never had; no database migration was required.
- `SECURITY-REVIEW-A2`: complete — backend PR #216. The advisory Luau reviewer can no longer report a pass over code it never read: it distinguishes `pass`, `finding`, `not_applicable` and `not_inspected`, records the content hash of every script it reviewed so a stale report is detectable, and reports a line and the matching source on every finding. Rules were added for RemoteFunction handlers, runtime code compilation, client-chosen player identity and client-chosen HTTP targets. It stays advisory — a finding still never negates generation, delivery or release.
- `ASSET-FABRIC-1`: complete — backend PR #227. The asset plan every generation produces now has a versioned typed contract: the kind of each asset is stated rather than implied, ids are unique and are what references point at, and the plan is bound by lineage to the game design it derives from. **The contract only** — nothing resolves, uploads or materializes an asset, and `ASSET-FABRIC-2` stays blocked on the Roblox Open Cloud credential surface that does not exist. Validation is **advisory**: a malformed plan is recorded unchanged and the generation still passes.
- `NOVELTY-2`: complete — backend PR #225. The structural fingerprint `NOVELTY-1` records now has a consumer, which it did not before. A generation carries an explicit verdict **when the run produced enough evidence to form one** — `GenerationExecution.novelty` is optional, and it is absent whenever no `GAME_DNA` artifact was recorded, the report could not be read, or the comparison failed. **Absence means the question was not resolved, never that the generation was found `distinct`.** Only exact fingerprint equality counts as a repeat — everything below that is a threshold nobody has measured. A repaired execution that carries its parent's design forward is named `repair-preserved` rather than reported as an unrelated duplicate, with ancestry read from artifact lineage rather than the execution id. **Advisory and threshold-free**: nothing blocks, warns or regenerates, and all eight promotion criteria for a similarity threshold are unsatisfied.
- `NOVELTY-1`: complete — backend PR #223. Each generation now carries a structural fingerprint of the game it produced, compared against the project's earlier generations read from durable storage rather than from process memory. The platform's existing diversity mechanism scores the seed it invents for itself before any agent runs, so it cannot tell two structurally identical games apart; this compares what was actually generated. Absence of a comparison is never reported as novelty — a first generation is uncompared, and a project whose earlier runs predate this stage says so. **Advisory**: nothing blocks, warns or alters a generation, and a gate is `NOVELTY-2`.
- `AGENT-SAFETY-1`: complete — backend PR #221. Every runtime agent declares how much authority it holds — Observe, Plan, Propose or Execute — and whether it may cause another agent to run. Delegation is refused before the callee runs and before any provider is reached when the caller may not delegate, when the callee is not reachable from the pipeline, or when it outranks the caller; the platform's own calls stay unrestricted, because only delegation is an agent choosing what runs. No agent claims Execute and validation refuses any that does, so a real execute path has to be a deliberate later slice.
- `STUDIO-2F`: decomposed into `STUDIO-2F-A`…`STUDIO-2F-E`. `STUDIO-2F-A` is complete through backend PR #195/#196/#197 and the [deferred Studio acceptance result](./00-project-control/STUDIO-DEFERRED-ACCEPTANCE_RESULT.md). This does not complete or scope `STUDIO-2F-B`…`STUDIO-2F-E`.
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
