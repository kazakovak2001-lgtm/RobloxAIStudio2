# DOC-202A Roadmap Authority Reconciliation

## Status

Complete through issue #163 and PR #164. The authority inventory remains the
fail-closed guard for subsequent roadmap reconciliations.

## Exact release identity

- Backend repository: `kazakovak2001-lgtm/RobloxAIStudio2`
- Backend release branch: `release/cutover-1e-candidate`
- Current backend runtime release: `ccd28ef816d1653df0aebd0775f70187aa321564`
- SECURITY-2G-F control baseline: `da55f716c798ec8c6a7f25a8e2a3b7b0a2244416`
- Paired Frontend repository: `kazakovak2001-lgtm/Frontend`
- Paired Frontend runtime contents: `6c1458d836244f2b720f361a78c2ab13f1682f74`

## Authority order

1. `ROADMAP_STATUS.md` is the ordered current delivery authority.
2. `CURRENT_STATE.md` is the current implementation and release-state authority.
3. This reconciliation record preserves the evidence and rationale for documentation-authority changes.
4. Dated TECH-AUDIT-2 roadmap, backlog and audit documents remain historical planning baselines and cannot override current project-control documents.

## Reconciliation findings

After SECURITY-2G-F merged through PR #162, the project-control documents still contained pre-merge wording and the prior backend release identity. The roadmap also linked to this reconciliation record before the file existed. DOC-202A introduces a tracked authority inventory and deterministic validator so those conditions fail closed instead of remaining informal documentation debt.

The August 6 reconciliation records the post-INTEGRATION-1A/1B release pair,
the project-scoped Studio API-key fix in PR #171, the architecture manifest fix
in PR #172, and the completed STUDIO-ACCEPT-1 evidence. ROADMAP-AUDIT-1 (#169)
sets authoritative Roblox runtime playtest evidence as the next product phase.

The pair-freshness reconciliation promotes the post-INTEGRATION-1B Frontend
runtime and the post-PR-174 backend runtime as one exact executable pair. It
also distinguishes those runtime identities from later control-only commits,
avoiding impossible mutual self-reference between two repository commits.

The August 8 reconciliation promotes the merged backend PR #177 (`fix: repair
unplayable ollama lua output`) and the merged Frontend PR #35 (`Use generated
artifacts for playtest and repair`) as the new exact executable pair. The
Frontend paired-release manifest and Production Paired Contract were
re-verified against the merged backend commit before promotion. STUDIO-SYNC-1A
completion evidence against issue #168's property-test and coverage
requirements was not re-verified in this reconciliation and remains open.

A follow-up reconciliation the same day independently re-verified STUDIO-SYNC-1A
against merged backend PR #176: all twelve P1-P12 property tests exist with
exact spec numbering and `numRuns: 100`, protocol registration for
`GET_PROJECT`/`GET_ARTIFACTS`/`SYNC_REQUEST`/`VALIDATE` is confirmed, and the
described test command was run live (98/98 passed). The Frontend side (issue
#32) was closed against a documented reinterpretation of its literal scope:
Frontend PR #37 added the P13 property test and real field-level sync/
connection markers on top of PR #34's two-card model, since
`studioBridgeApi.ts`/`ProtocolMonitor.tsx` and individual Studio protocol
messages do not exist in the current canonical Frontend. Both issues are
closed; `ROADMAP_STATUS.md` and `CURRENT_STATE.md` mark STUDIO-SYNC-1A
complete.

RUNTIME-PLAYTEST-1 is also recorded complete the same day. A generated
vertical-slice project was delivered through the canonical Studio path and
run in Roblox Studio Play mode on the exact merged pair (`f3b89c90`/
`06203ad0`): the world rendered, the player spawned correctly, the objective
was completable, the HUD updated live, and no runtime errors were reported.
See [RUNTIME-PLAYTEST-1_RESULT.md](./RUNTIME-PLAYTEST-1_RESULT.md) for the
full record, including its explicitly documented evidence limits — this
result is operator-observed rather than a fully captured machine-verifiable
receipt trail the way STUDIO-ACCEPT-1 is, and the record says so plainly
rather than overstating its rigor.

REPAIR-1A promotes the runtime pair to backend `243116da73808cc4a1202cb007d9bd1f2dad2b69`
(PR #185) and Frontend `33cb19310ad15097eac1ff53832ee7d8191bd65e` (companion
PR #38). `RepairEngine`/`RepairExecutor` no longer simulate improvement: one
real strategy (`regenerate_script`, whole-package regeneration via
`LuaGeneratorAgent`) is implemented and gated by the same
`assertPlayableLuaScripts` contract generation uses; every other strategy
fails closed as not-yet-implemented instead of faking success. Repaired
artifacts persist under a new execution id — the parent execution is never
mutated — and session state is now durable. The Frontend companion PR moves
the E2E contract's repair check to run against a real post-generation
execution instead of a pre-generation synthetic fixture. Studio redelivery of
repaired artifacts (REPAIR-1B) and rollback/audit (REPAIR-1C) are not yet
implemented.

REPAIR-1B promotes the runtime pair to backend `6ec42d55a74bab0a9001d7e66c02795f01b41886`
(PR #187); Frontend contents are unchanged at `33cb19310ad15097eac1ff53832ee7d8191bd65e`
since REPAIR-1B is backend-only. `POST /api/repair/:projectId/deliver` resolves
the most recent successfully-repaired execution server-side from the repair
session's own history — never client-supplied — and reuses the existing
`StudioIntegrationManager.synchronizeExecution`/`queueProjectExport` pipeline
unchanged to push it to a connected Studio client; no Studio plugin (Lua)
changes were required, since `EXPORT_PROJECT` commands are already handled
generically regardless of origin. A design review before implementation
found and fixed a real bug: `RepairEngine.run()` was overwriting the
persisted session's history on every call instead of appending to it, which
would have made an earlier successful repair undiscoverable by the new
delivery route after a later call. CodeRabbit review before merge found and
a follow-up commit fixed two further real issues: concurrent `run()` calls
for the same project could race and drop one call's history (now serialized
per project), and two successful repairs of the same parent execution could
collide on the same derived execution id and mix artifacts (now derived from
the cumulative count of prior attempts against that parent).

REPAIR-1C promotes the runtime pair to backend
`558f9e6f5cc80e3ae9e29cafdd15ce6a33addd0f` (PR #189); Frontend contents are
unchanged since REPAIR-1C is backend-only. It adds a durable delivery/rollback
audit trail (`RepairDeliveryRecord[]`, a sibling array on the existing
`RepairSessionState` document — no new storage collection) and lets
`POST /:projectId/deliver` accept an optional `executionId` to redeliver an
explicit older execution (the original parent or an earlier repair) instead
of only the latest repair, with the id validated against that project's own
repair history before it ever reaches Studio. `GET /:projectId/deliveries`
combines the audit trail with the existing generic Studio evidence. A design
review before implementation required two amendments before ship: joining the
new `recordDelivery` write path to the same per-project serialization queue
`run()` already uses (otherwise a concurrent write could be silently dropped,
since `RepairSessionStore` does whole-document overwrites with no CAS), and
carrying `priorSession.deliveries` forward in `runExclusive` the same way
`history` already is (otherwise a later `run()` call would silently erase the
audit trail). Post-merge, CodeQL repeatedly flagged log-injection risk in the
audit-write-failure logging; two sanitizer approaches routed through a named
helper function were both invisible to its taint analysis, resolved by
inlining the sanitizing `.replace()` call directly at each log call site.
REPAIR-1 (1A/1B/1C) is now complete on the backend. A Frontend UI surfacing
repair, delivery, and rollback is a separate, not-yet-scoped follow-up.

The REPAIR-1 Frontend UI closes that follow-up and promotes the runtime pair
to backend `ccd28ef816d1653df0aebd0775f70187aa321564` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74` (PR #40). Two points of precision
about that backend identity: it is a documentation-only descendant of the
REPAIR-1C merge `558f9e6f5cc80e3ae9e29cafdd15ce6a33addd0f`, verified by
diffing the two commits and finding zero changes under `server/`, so the
promotion changes the recorded identity without changing executable content;
and the earlier per-phase paragraphs above deliberately retain the merge SHAs
that were current when each phase landed, since they are historical records
rather than statements about the present pair. The Frontend change adds an
Integrate-stage repair panel over existing routes from two sub-phases — the
run action calls the REPAIR-1A route `POST /api/repair/run`, while
redelivery, rollback and the audit trail call the REPAIR-1B/1C routes
`POST /api/repair/:projectId/deliver` and
`GET /api/repair/:projectId/deliveries` — and it repairs a stale client
contract: the previous generic repair call predated
REPAIR-1A and omitted the `executionId` the merged route requires, so it
would have failed closed with HTTP 400 on every invocation. Review found one
real defect before merge: a mutation begun on one project could resolve after
a project switch and write the previous project's session and delivery
history into the panel, since the mutation reused a `reconcile` closure bound
to the earlier project and superseded the current project's in-flight request
through the shared latest-request guard; a dedicated mutation guard fixes it.
Evidence limits are stated rather than smoothed over: the UI is verified by
contract, parser, type, build and paired-contract CI, but no Studio-attached
live end-to-end run of the panel was performed, and the repository's workspace
test runner cannot load `.tsx`, so no component-level regression test backs
the panel or its guard fix.

## Required deterministic behavior

The DOC-202A validator must reject:

- missing current authority documents;
- broken authority links;
- duplicate authority ranks or paths;
- wildcard or ownerless authority entries;
- non-exact backend or Frontend release identities;
- stale statements that a merged PR is still pending review or merge;
- current authority files classified as historical, or historical planning files classified as current authority;
- missing required current-state claims.

## Scope boundary

DOC-202A does not implement `STUDIO-2F`, `AUTONOMY-3A` or `COLLAB-3B`. It establishes documentation authority and post-merge truthfulness only.
