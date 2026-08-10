# DOC-202A Roadmap Authority Reconciliation

## Status

Complete through issue #163 and PR #164. The authority inventory remains the
fail-closed guard for subsequent roadmap reconciliations.

## Exact release identity

- Backend repository: `kazakovak2001-lgtm/RobloxAIStudio2`
- Backend release branch: `release/cutover-1e-candidate`
- Current backend runtime release: `3e18460c394b03c2d373c7d1a2e9cd0b74b6f984`
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

PROVIDER-1A advances the runtime pair to backend
`ecae9bb59f1639d2e382e7221a956aa96460b3e9` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74` (backend PR #193). Unlike the two
promotions above, this backend identity is a real executable change rather
than a documentation-only descendant, and it is backend-only: the Frontend
identity is unchanged and the paired production contract stayed green against
the existing pin. The slice closes a truthfulness defect in which
`LLMProviderFactory.createByName()` handled only four of the six supported
providers, so an explicit `ollama` or `openrouter` request silently produced
no provider, every agent fell through to its deterministic fallback, and
`LuaGeneratorAgent`'s hardcoded fallback game — written to satisfy the
playability contract — was recorded as a completed execution, delivered to
Studio with valid receipts and scored, with nothing durable distinguishing it
from a real generation.

Two facts about this reconciliation are worth recording for future phases.
First, the authority gate did not catch the drift it exists to prevent: the
PROVIDER-1A documentation merged while literally asserting "It is not merged,
so the runtime pair recorded above is unchanged", and the validator accepted
it because required claims are checked for presence, not for truth. A claim
that is present but stale passes. Second, the per-phase paragraphs above again
retain the SHAs current when each phase landed; only the "Exact release
identity" header, the pin configuration and the active-pair lines advance.

STUDIO-2F-A advances the runtime pair to backend
`d7e444549d324df9df339ff5bda7a75a820e39e3` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, across three backend pull
requests: #195 established the wire contract and deterministic builder, #196
added plugin materialization and moved the plugin to v1.9.0, and #197 added
backend verification of the reported screen set. The phase is reconciled once
rather than per pull request, because the pin can only name a merge commit
that exists, and pinning to an intermediate one would have been stale on
arrival.

Two limits are recorded rather than smoothed over. The phase is complete in
code but **not proven in Studio**: `studio-plugin/` has no Lua test harness,
the plugin assertions are structural checks over source text, and nothing in
the phase has executed Lua. Operator-observed acceptance, defined by five
required observations in the scope record, is outstanding. Separately, the
delivered tree is parented under `ReplicatedStorage` rather than `StarterGui`
by the scope's binding decision, so it is inspectable and editable but inert
at Play time; the imperative Lua HUD remains runtime-canonical until
`STUDIO-2F-E`.

Review across the three pull requests found four real defects, each fixed
before its merge, and they share one shape worth recording for future phases:
a field or an instance quietly lost at a boundary. Replacement and sweep
rescued only the direct children of a screen, so creator-authored instances
nested below the first level were destroyed with it. `SyncManager` dropped the
identity-bearing screen receipt, and then `parseImportReport` dropped it again
at the transport boundary — the second occurrence would have made verification
reject every real UI export, and the tests missed it because they exercised
the runtime below that boundary. Verification also read the mutable artifact
store rather than the content the export actually carried, which
`ProjectSyncManager.applyChange` can change after queueing.

The DOC-202A validator must reject:

- missing current authority documents;
- broken authority links;
- duplicate authority ranks or paths;
- wildcard or ownerless authority entries;
- non-exact backend or Frontend release identities;
- stale statements that a merged PR is still pending review or merge;
- current authority files classified as historical, or historical planning files classified as current authority;
- missing required current-state claims.

ARTIFACT-1, PROVIDER-1B and SECREVIEW-1 advance the runtime pair to backend
`12bd4dc6c736aa6af7b3346624152032157d5bd1` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, across backend pull requests `#199`,
`#200` and `#201`. All three are executable changes, so the pair moves; the
Frontend identity is unchanged. They are reconciled together rather than one at
a time, for the same reason STUDIO-2F-A was: a pin can only name a merge commit
that already exists.

A merged pull request is not by itself a completed phase. PROVIDER-1B and
SECREVIEW-1 are backend TypeScript with executing tests and are complete.
ARTIFACT-1 is recorded as code complete but not done, on the same standard
STUDIO-2F-A is held to: its change is plugin Lua, the repository has no Lua test
harness, and no Studio-attached run has confirmed that a real re-export replaces
the previous instance without destroying creator content. The runtime pair
advances either way, because the pair records what is merged, not what is
accepted.

One of the three carries a standing policy decision that must not be eroded by
a later editor. **SECREVIEW-1 is advisory by explicit decision, not by
omission.** A security finding never negates generation, delivery or release.
Each `SECURITY_REVIEW` artifact records `analysisMode` and `enforcement` as
typed values on the durable record precisely so a future blocking regime cannot
be read backwards onto reports written under this one. Promotion to a blocking
gate is the separate `SECURITY-REVIEW-B` delivery and may begin only when all
seven criteria in
[its promotion record](./SECURITY-REVIEW-B_PROMOTION_CRITERIA.md) hold.

Two defect classes recurred across these three slices often enough to be worth
recording as patterns rather than incidents. The first is a value quietly lost
or fabricated at a layer boundary: the metadata sweep destroyed instances it
had itself just written, and the v2 pipeline persisted a generic passthrough
object under the name `securityReport.json`, producing a file that claimed to
be a security report and contained no review. The second is a test that passes
with and without the fix: two SECREVIEW-1 regressions passed with the defect
deliberately reintroduced, because an unrelated fix suppressed the symptom.
Both were established by mutating the source, confirming the suite fails, and
restoring it — which is now the expected way to verify that a regression test
actually regresses.

PIPELINE-1A advances the runtime pair to backend
`d3ddcce4408b950dc2ebe1ef2767998f93e83970` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, through backend pull request `#203`.
The Frontend identity is unchanged.

The slice is recorded here for one reason beyond its own evidence: it started
as a refactor on the roadmap and turned out to be a trust-boundary fix. The
pipeline lived as an unexported array inside `PlannerEngine`, and
`requiredAgents` from the request body selected against it, so a client could
strand a run with no reason recorded or obtain a reported success from agents
that do not exist. Both were reproduced before being changed. That order —
reproduce, then fix — is what distinguishes this record from an assertion, and
the same discipline applied to review: the two defects reviewers raised were
each confirmed by building the reviewer's own case as a test and watching the
current implementation fail it.

What this slice deliberately does not do is add a stage. A validation gate and
conditional nodes are `PIPELINE-1B`. Adding a stage changes what every
generation runs and costs, so it carries its own evidence rather than riding
along with the change that makes it safe.

PIPELINE-1B advances the runtime pair to backend
`d7dc84061dd2045e68b4a38f970fe42e7c25abce` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, through backend pull request `#205`.
The Frontend identity is unchanged.

Two decisions in this slice are recorded here because a later editor could undo
either while believing they were completing unfinished work.

**`TesterAgent` is deliberately not the VALIDATION stage.** It emits a checklist
whose every entry is `pending`, alongside `passed: 0, failed: 0`. Stored under
the name `validationReport.json` that reads as a clean validation result for
work that never ran — the same defect as the passthrough security report
SECREVIEW-1 removed, in a more convincing shape. Wiring it in would look like
progress and would be a fabricated capability. The stage is deterministic in
both pipelines instead.

**A rejected generation still persists no content artifacts.** That invariant
belongs to STUDIO-1A and delivery depends on it: partial content under a failed
execution id is what a later consumer could mistake for a deliverable package.
The first implementation of this slice recorded every stage and then failed,
and four STUDIO-1A tests caught it. Content artifacts are staged and committed
only once validation passes, so a rejected run leaves exactly one artifact, and
it carries no generated content: the `VALIDATION` report saying why the run was
rejected. The gap this slice closes was never the discarding; it was the
silence.

Conditional stages remain unbuilt and are recorded as `PIPELINE-1C`. Nothing
needs to skip a stage yet, and a branching mechanism with no consumer is
scaffolding rather than capability.

WORLD-1A advances the runtime pair to backend
`18bdc2cddd8b80dba5c779e51c5f3947cce9484a` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, through backend pull request `#207`.
The Frontend identity is unchanged.

The slice began as a fork worth recording, because the obvious first step was
the wrong one. A scene-graph artifact had no producer and no consumer: no agent
emits geometry, and materializing one would duplicate the world the generated
server script is required to build, so it would have been groundwork dressed as
capability. Cross-artifact validation was chosen instead, and it turned out to
be the piece with immediate value — every gate in this pipeline checked one
artifact against itself, and none had ever asked whether two agree.

Three properties are the substance of the check and must survive later edits.
A claim whose role no source-text evidence could settle is reported
`unverifiable`, never `supported`. The evidence map is exhaustive over the role
set, so adding a role forces a decision about what would prove it instead of
letting it default to a pass. And server claims are matched only against server
source, because client code declaring a `SpawnLocation` must not satisfy a
claim about what the server owns — that is the case the check exists to catch.

**The world model is non-canonical and unmaterialized.** The runtime world is
still built imperatively by the generated server `Script` that the playability
contract requires. Nothing in this slice creates Roblox instances, and no
ownership switch is proposed; materialization is `WORLD-1B`. This section
recorded that as blocked on `STUDIO-2F-E` when WORLD-1A merged, which was
wrong on the same point corrected in the WORLD-1B section below: the HUD flip
is a separate concern. `WORLD-1B` shipped as design-time materialization, and
the canonical world switch is `WORLD-1C`, gated on operator-observed
`WORLD-1B` evidence.

One review finding is worth naming for the record: the v2 pipeline had no
branch for the new agentless stage, so it would have persisted a passthrough
marker under the name `worldModel.json`. That is the third time this shape has
been caught, after the security report and the validation report. The branch
now carries a note that any future agentless stage needs its own.

WORLD-1B advances the runtime pair to backend
`4fa948b12ebba768ca5e43442dd361d851b905e3` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, through backend pull request `#209`.
The Frontend identity is unchanged.

**WORLD-1B is design-time materialization, and that is an ownership decision
rather than a limitation to be lifted casually.** The playability contract
requires the generated server `Script` to build the world into `workspace` at
run time. A scene graph placed there would stand beside a second world on Play,
so the scene is delivered into `ReplicatedStorage.AIStudioArtifacts`, which
nothing in generated Lua reads. Moving it is `WORLD-1C`. The dependency recorded here when WORLD-1B merged
was `STUDIO-2F-E`, and that was wrong: the HUD flip is a separate concern that
`WORLD-1C` leaves untouched. `WORLD-1C` requires operator-observed `WORLD-1B`
evidence instead, as [ROADMAP_STATUS.md](./ROADMAP_STATUS.md) and
[WORLD-1C_SCOPE.md](./WORLD-1C_SCOPE.md) already state.

The slice is recorded as **code complete, not done**, on the same standard
ARTIFACT-1 and STUDIO-2F-A are held to. There is no Lua execution harness in
this repository, so replacement, sweep, collision and partial-attach behaviour
is asserted against the delivered source rather than observed running. The
operator session that would close it is specified in
[its scope record](./WORLD-1B_SCOPE.md) and has not been attempted; the
still-pending ARTIFACT-1 and STUDIO-2F-A evidence is untouched.

One review finding is worth keeping for the pattern rather than the fix. The
entire plugin half of this slice was unreachable at first review: the loader
never dispatched to it, the sync manager dropped its receipt, and the packager
omitted its module. Three scripted edits had silently matched nothing, and the
contract tests passed throughout because they tested the parts rather than the
path between them. Tests now assert the dispatch, the forwarding and the
packaging directly, and a change that only exercises its own components should
be assumed unwired until something proves otherwise.

AGENT-CONTRACT-1 advances the runtime pair to backend
`ddfa10453d9e2f48bc9e57045d40a8792d3cc297` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, through backend pull request `#212`.
The Frontend identity is unchanged.

`AgentRegistry` constructed sixteen agents keyed by string, and no document or
type stated what any of them produces, whether it may substitute deterministic
content, or how many times it retries. An unknown name returned
`{ _skipped: true }`. Each agent now carries one versioned, server-owned
definition.

**A policy that nothing reads is not a contract, so each one had to earn its
place.** `id` and `version` are identity and `title` is a human-readable label
that nothing reads; neither is claimed as a policy. Of the rest: `requiresModel` and `fallback` gate `AgentRegistry.executeAgent` before
and after the provider call; `reachability` is enforced by pipeline validation;
`requiredKeys` is asserted against the real parser call sites; `maxAttempts` is
reconciled against the ceiling each constructed agent actually loops. Wall-clock
timeout, monetary cost and input-token ceilings were left out and recorded as
gaps: `BaseAgent.timeout` is assigned and never read, and `estimateCost` is
never called on the generation path, so declaring either would have described a
guarantee the runtime does not make.

Provenance lands on `pipeline_steps[].agent_version`, recorded only for steps
whose agent ran. A node blocked by an upstream failure records none, because no
definition governed work that never happened, and executions written before this
slice carry no version that anything rewrites.

Two review findings are worth keeping for the pattern. Four of the six defects
were the contract asserting something the runtime does not do — a required
output key that never appears in a successful response, three retries where the
implementation loops one, and a version stamped on nodes that never reached
their agent. A contract derived from reading code is still a claim, and it
drifts the same way documentation does. The answer was not only to correct the
values but to reconcile them mechanically: `npm run validate` now fails on
definition/registry mismatch in either direction and on any declared attempt
count the implementation does not loop. The other: two provenance tests
asserted only over locally declared constants and could not fail in any
circumstance, which is the same failure mode as a durable record that says
something did not happen when nothing checked.

Dynamic orchestration, agent substitution, model routing, cost optimisation and
new agents are outside this slice and remain unbuilt.

ARTIFACT-CONTRACT-2 advances the runtime pair to backend
`79b1ecfd137dff71e17fcc57e45078a47137fcdf` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, through backend pull request `#214`.
The Frontend identity is unchanged.

A durable artifact carried enough to be stored and delivered and not enough to
be identified. `pipelineId` named the execution, not the project. `agent` held
a real agent id for some stages, `null` for three different deterministic
producers, and invented strings such as `repair-engine` for others. No schema
version, no content hash, no lineage. Every newly produced artifact now carries
a schema version, an owning project, a content hash and a producer, and the
store refuses to write one that is missing any of those. Lineage is the
exception: it is recorded only where an upstream actually exists, because an
empty dependency list would assert a relationship rather than record one.

**The defect this closes was live, not theoretical.** A repaired execution
copied the parent's `SECURITY_REVIEW` and `VALIDATION` forward unchanged, so
regenerated Lua sat beside a security report of the Lua it replaced, under one
execution id, with nothing marking either as stale. The review is now
re-derived from the repaired scripts by the same pure function the generation
path uses, and the repaired Lua records a lineage edge to the Lua it replaces.
No validation report is emitted for a repair, because rebuilding one needs the
UI materialization outcome and world cross-validation that a repair does not
re-run, and a report naming checks that did not happen is the failure this
whole slice exists to prevent.

Content identity is SHA-256 over a canonical serialization, computed once at
creation. Object keys are sorted at every depth because the data model treats
objects as unordered and a JSONB round trip does not preserve insertion order;
arrays are left alone because order is meaning there. Values that cannot be
given a deterministic identity are rejected rather than dropped. It is
integrity identity only: it says what the bytes were, never that they are safe,
and project authorization remains entirely separate.

Two review findings are worth keeping for the pattern. `canonicalJson` rejected
`undefined`, functions, symbols and bigints but not `Map`, `Set` or class
instances — `Object.keys` sees nothing inside those, so every one of them
serialized to `{}` and shared a single hash with every other. A guard that
enumerates the cases it knows about will always miss the cases it does not;
the fix inverts it to reject anything that is not plain data. And a test
asserted that a storage round trip reorders keys while its fixture did no
reordering at all, so the property it named was never exercised — the same
shape as a durable record asserting something nothing checked, which is the
class of defect this contract was written against.

Historical artifacts carry no envelope and are held to none. Nothing infers a
schema version, project, hash or producer for them, and nothing may bind to
one. `kv_store.data` is already `JSONB`, so no database migration was required.

SECURITY-REVIEW-A2 advances the runtime pair to backend
`3e18460c394b03c2d373c7d1a2e9cd0b74b6f984` and Frontend
`6c1458d836244f2b720f361a78c2ab13f1682f74`, through backend pull request `#216`.
The Frontend identity is unchanged.

**A reviewer that cannot say whether it looked is not advisory, it is
misleading.** `clean` was `findings.length === 0`, so a review over nothing
reported the same thing as a review that examined a package and found it
sound. Three paths reached that: the v2 pipeline reviews an empty script list
when Lua cannot be normalized and persists the result, the repair path reviews
whatever normalizes regardless of location, and any script outside a server or
client folder was skipped in silence while the remainder still read as a
complete review. An existing test asserted the last of those as correct
behaviour, which is how it survived SECREVIEW-1 review.

A report now carries an outcome of `pass`, `finding`, `not_applicable` or
`not_inspected`. `pass` is the narrowest and requires **at least one** script
to have been analysed _and_ every supplied script to have been analysed —
stated as two conditions because the second alone is vacuously true of an
empty list, which is exactly the case that used to report clean. An empty or
unnormalizable input reports `not_inspected`; an input whose every script sits
where no rule applies reports `not_applicable`. `finding` deliberately takes precedence over coverage,
because a real defect is never a misleading pass and demoting it to a coverage
status would hide the more important signal — so coverage is stated separately
instead of being inferred.

Each reviewed script records the content hash of the exact bytes read, built as
the ARTIFACT-CONTRACT-2 construction for a string payload. It is computed in the
validation layer rather than imported from the pipeline layer, so no dependency
is added in that direction, and a test pins the two constructions against each
other so they cannot drift apart in silence.

Four coverage gaps were closed. `OnServerInvoke` had never been scanned, so
every rule was blind to the RemoteFunction half of the trust boundary — the
same boundary reached through a different assignment. Runtime code compilation
had no rule. Resolving a player from a client-supplied value was read as
_validation_ by the general guard, which is correct for a reward table and
exactly wrong for a player registry. An outbound request whose target the
client chose had no rule.

One review finding is worth keeping for the pattern. A package holding an
analysed script beside an unreviewable one still reported `pass`, because one
script had passed. Correcting a misleading result at the report level had
simply moved the blind spot into a file inside it, which is the same defect one
level down and would have shipped as a fix.

**The review remains advisory.** Enforcement is still a constant rather than a
function of what was found, no code path branches on it, and no
`SECURITY-REVIEW-B` promotion criterion is satisfied by this slice. Evidence
advances toward criterion 3 — three high-severity false negatives were found
and closed, which is also evidence that the covered pattern set had holes — and
toward criterion 4, where findings now carry a code, severity, line and
evidence but still no confidence. Criteria 1, 2, 5, 6 and 7 are untouched.

## Scope boundary

DOC-202A does not implement `STUDIO-2F`, `AUTONOMY-3A` or `COLLAB-3B`. It establishes documentation authority and post-merge truthfulness only.
