# SIM-TRUTH-1 — stop presenting deterministic simulation heuristics as measured player engagement

**Status:** `scoped`. The audit below is complete and the slice is implemented in the pull request
that carries this record; the roadmap row stays `scoped` until that merges and a reconciliation
advances it, so nothing claims completion before the pair verifies it.
**Audit baseline:** `8f6e6a94599c180807deb2fc670e2cffd110417a`
**Origin:** recorded as carried work by [PLAYTEST-TRUTH-1](./PLAYTEST-TRUTH-1_SCOPE.md), which named
`simulation/agents/PlaytestAgent` as a second, separate `PlaytestReport` and explicitly did not fix it.

## What this is not

- **This is not `PLAYTEST-2`.** It adds no runtime playtest capability, no visual or input-aware
  player, and nothing here is evidence toward it. `PLAYTEST-2` remains `unscoped` and blocked.
- **Deterministic simulation is not a Roblox runtime play session.** `GameSimulationEngine` advances a
  counter and applies modulo arithmetic to a blueprint. No Roblox engine runs, no place loads, no
  player exists, nothing is rendered, and no input is simulated.
- **No claim about real player engagement, fun, quality or balance** is in scope. The platform has no
  grounds for any of them and this slice does not create them.

## The untruth

`PlaytestReport.engagementScore` is a 0–100 number named after player engagement. It is produced by
weighting four values from a deterministic script:

```text
engagementScore = round(loopProgress*40 + mechanicsCoverage*30 + npcRate*15 + (engaged ? 15 : 0))
```

Nothing in that expression observed a player. Three of the four terms are artifacts of the
simulator's own stride arithmetic, and the fourth is a constant unless the blueprint is degenerate.

## Producer graph — where each input actually comes from

`GameSimulationEngine.simulateGame(blueprint, ticks = 100)` builds `SimulationResult.finalState`:

| Field                    | How it is produced                                                                        | Layer                                           |
| ------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `mechanicsUsed`          | every 3rd tick, adds `mechanics[tick % L]`                                                | observed simulation fact, stride-limited        |
| `npcStates[].interacted` | every 5th tick, marks `npcStates[tick % N]`                                               | observed simulation fact, stride-limited        |
| `playerState.currency`   | every 4th tick, `+10`, unconditionally                                                    | observed simulation fact, blueprint-independent |
| `playerState.level`      | `currency >= level * 50`                                                                  | derived, blueprint-independent                  |
| `loopProgress`           | `min(1, mechanicsUsed.size / max(L,1))`                                                   | **derived — identical to `mechanicsCoverage`**  |
| `playerState.engaged`    | starts `true`; set `false` only when no `mechanic_used` event occurred in 20 ticks        | **derived heuristic, not an observation**       |
| `events[]`               | `mechanic_used`, `npc_interact`, `currency_gain`, `level_up`, `loop_complete`, `friction` | observed simulation facts                       |

Then: `PlaytestAgent.analyze` → `GameplayMetricsEngine.extract` → `SimulationFeedbackEngine.generateFeedback`
→ `GenerationRefinementBridge.processFeedback` → `MemoryEngine.storeMemory`.

## Measured findings from the audit probe

The production engines were run unmodified over synthetic blueprints. Only the blueprint's mechanic
and NPC counts vary:

| mechanics | npcs | coverage | loopRate | npcRate | engaged | engagement | econStability | grade | regenerate |
| --------- | ---- | -------- | -------- | ------- | ------- | ---------- | ------------- | ----- | ---------- |
| 1         | 1    | 1.000    | 1.000    | 1.000   | true    | 100        | 100           | A     | false      |
| 2         | 2    | 1.000    | 1.000    | 1.000   | true    | 100        | 100           | A     | false      |
| 3         | 3    | 0.333    | 0.333    | 1.000   | true    | 53         | 100           | C     | false      |
| 4         | 4    | 1.000    | 1.000    | 1.000   | true    | 100        | 100           | A     | false      |
| 5         | 5    | 1.000    | 1.000    | 0.200   | true    | 88         | 100           | A     | false      |
| 6         | 3    | 0.333    | 0.333    | 1.000   | true    | 53         | 100           | C     | false      |
| 9         | 10   | 0.333    | 0.333    | 0.200   | true    | 41         | 100           | C     | false      |
| 0         | 4    | 0.000    | 0.000    | 1.000   | false   | 15         | 100           | D     | false      |
| 0         | 0    | 0.000    | 0.000    | 1.000   | false   | 15         | 100           | D     | false      |
| 12        | 5    | 0.333    | 0.333    | 0.200   | true    | 41         | 100           | C     | false      |

Six facts follow, each reproducible from the table:

1. **`loopCompletionRate` and `mechanicsCoverage` are the same number in every row.** The engine sets
   `loopProgress` from the identical expression `PlaytestAgent` recomputes. The score weights that one
   quantity **70 of its 100 points**, as two apparently independent terms.
2. **A blueprint with 3, 6, 9 or 12 mechanics is capped at 0.333 coverage.** Mechanics are consumed at
   `tick % 3`, so when the mechanic count shares the factor 3 the stride can never reach the rest.
   Four mechanics scores 100 and grade A; three mechanics scores 53 and grade C. The difference
   measures the simulator's stride, not the game.
3. **A blueprint with 5 or 10 NPCs is capped at 0.200 interaction rate**, by the same argument at
   `tick % 5`. It also raises a `dead-end` issue reading "Only 20% of NPCs were interacted with" — a
   finding stated about the game that is caused entirely by the simulator.
4. **`economyStability` is 100 in every row.** Currency accrues `+10` every 4th tick regardless of the
   blueprint, so the ratio it is computed from cannot vary with the game. It is a constant of the
   simulator, and it contributes 30% of the grade.
5. **`shouldRegenerate` is `false` in every row, including a blueprint with no mechanics and no NPCs.**
   Grade `F` requires a composite below 35, but the constant `economyStability = 100` contributes a
   floor of 30 and the worst observed composite is 36. The other path to regeneration requires a
   `critical` item, and no `critical` severity is emitted anywhere in this pipeline — the highest is
   `high`. **Both branches are unreachable: the decision is structurally always `false`.**
6. **A blueprint with zero NPCs scores `npcRate = 1.000`**, from `blueprint.npcs.length > 0 ? … : 1` —
   full credit, +15 points, for interacting with nothing.

## The three layers, stated explicitly

**1. Observed deterministic simulation facts.** Which mechanics the stride reached; which NPCs the
stride reached; the tick at which each event fired; currency and level totals; whether a
`loop_complete` or `friction` event was emitted; total ticks. These are real facts _about the
simulation run_ and are worth keeping. They say nothing about a player.

**2. Derived heuristics.** `loopProgress` (a rename of coverage); `engagementScore` (weights
40/30/15/15); `economyStability` (a ratio that cannot vary); `completionRate` (coverage a third time);
`npcInteractionFrequency`; the composite grade (weights 0.4/0.3/0.3, thresholds 80/65/50/35);
`retentionSimulated` (0.5/0.3/0.2); `overall` health (0.3/0.25/0.15/0.15/0.15); the ±5 trend band.
**Every weight and threshold in that list is an arbitrary policy choice.** No measurement justifies
any of them, and none is recorded as a policy anywhere.

**3. Claims and decisions.** The word "engagement"; the implication of a "player" and of "retention";
the letter grade; `shouldRegenerate`; the `dead-end`, `pacing` and `economy` issues asserted about the
game; and the health `trend`.

## Required questions, answered

**Which inputs are actually observed from deterministic simulation state?** Only which mechanics and
NPCs the stride reached, the event log, and the tick counts. Everything else is derived.

**Which weights and thresholds are arbitrary policy?** All of them — the four score weights, the three
grade weights, the four grade thresholds, the three retention weights, the five health weights, the
±5 trend band, and the `< 0.5`, `< 30`, `< 0.5` feedback cutoffs. None is derived from data.

**Does `playerState.engaged` come from a measured observation?** No. It is initialised to `true` — the
answer is assumed before the run — and can only flip to `false` through the friction heuristic, which
requires no `mechanic_used` event in 20 ticks. Because mechanics fire every 3rd tick whenever the
blueprint has any, `engaged` is `false` only for blueprints with **zero** mechanics. It is a second
heuristic over the same signal already counted twice, contributing a further 15 points.

**Where can missing simulation data become a fabricated positive result?** Three places.
`routes/lifecycle.ts` substitutes `?? 70` for engagement, `?? 70` for economy health, `?? 70` for world
stability and `?? 10` for anomaly rate; `GameplayMetricsEngine` substitutes `50` for
`economyStability` when no currency was gained; and `PlaytestAgent` substitutes `1` for `npcRate` when
the blueprint has no NPCs. The first is the worst: an unsimulated game returns **`overall` health 73
with `retentionSimulated` 70**, verified by running `GameHealthMonitor` with those exact defaults.

**Does `?? 70` mean unknown, not simulated, or acceptable?** It is written as though it meant
"unknown", and it behaves as "acceptable". It is arithmetically indistinguishable from a real reading
of 70 the moment it enters `computeHealth`, and it produces a passing composite. This is the same
defect `PLAYTEST-TRUTH-1` removed, where absence had to be made explicit rather than defaulted.

**Which decisions materially change generation or lifecycle behaviour?** On the evidence, **none
today.** `shouldRegenerate` is structurally unreachable (finding 5). `GenerationRefinementBridge`
writes the grade into `MemoryEngine` under `agentId: "simulation-feedback"` with the stated purpose of
improving future generations, but that string appears at the write site and nowhere else — nothing
reads it back. The health `trend` and `overall` are returned to the caller and drive nothing observed
in this audit. **The material harm is therefore what is claimed, not what is done** — which lowers the
urgency and does not reduce the untruth.

**Is the score persisted or exposed as evidence?** It is not written to durable artifact storage.
`GameArtifact.simulationReport.playtest` carries it in memory only, and `routes/simulation.ts` holds
results in a process-local `Map`. It is exposed on four mounted routes: `/api/simulate` (score, grade,
`shouldRegenerate`), `/api/compile` (`simulation.engagement`), `/api/v1` (`simulation.engagement`) and
`/api/lifecycle` (health and retention derived from it). At `/api/lifecycle/tick` the value is taken
from `req.body` — **client-supplied, never server-observed** — and is then reported back as health.

**Could the raw deterministic findings replace the score for those decisions?** Yes, and cheaply,
because no decision currently depends on the score. `shouldRegenerate` is unreachable, so removing the
score removes no working behaviour. Any future regeneration rule can name deterministic evidence
directly — a `loop_complete` event was or was not emitted; N of M mechanics were reached by the
stride; a `friction` event fired at tick T — without inventing a second aggregate.

## Proposed implementation direction — the pre-implementation proposal

_Written before the slice was built, and kept as the record of what was intended. The section after
"Explicitly out of scope" states what was actually delivered against it._

1. **Declare an evidence kind**, as `PLAYTEST-TRUTH-1` did, naming this report deterministic
   simulation rather than measurement, so a future real-runtime source must declare itself.
2. **Separate the three layers in the type**: observed simulation facts; derived values explicitly
   labelled derived, with the policy that produced them named; and no claim presented as a measurement.
3. **Keep every deterministic finding.** The event log, per-mechanic and per-NPC reach, the tick
   counts and the issue list are useful and stay. This slice deletes an aggregate, not evidence.
4. **Do not mint a replacement score.** No new weighted number, no rebalanced weights, no tuned
   threshold.
5. **Unknown must stay unknown.** Every `?? 70`, the `50` economy substitute and the `1` NPC substitute
   become explicit absence. An unsimulated game must not report a passing health figure.
6. **Behaviour decisions rest on named deterministic evidence or an explicit recorded policy**, never
   on a score presented as a measurement. If `shouldRegenerate` is to exist, it states its rule.
7. **Name the stride artifacts.** Coverage capped by `tick % 3` and NPC reach capped by `tick % 5` are
   properties of the simulator; either the traversal is fixed or the limitation is reported alongside
   the finding, so a `dead-end` issue is never asserted about a game because of a modulo.

## Explicitly out of scope

- Rewriting or redesigning `GameSimulationEngine`. Whether a modulo-driven walk is a worthwhile model
  of play is a real question and a different, larger one.
- `PLAYTEST-2`, `PLAYTEST-3`, `PLAYTEST-4` and any real runtime, input or visual capability.
- The economy, world and lifecycle subsystems beyond the specific defaults and claims listed above.
- Any Studio acceptance work, which stays paused and untouched.
- The `MemoryEngine` retrieval question. That nothing reads `simulation-feedback` is recorded here as
  a finding; deciding whether it should be read is separate work.
- Frontend or UI copy, which this audit did not survey.

## Recommended classification

- **Name:** `SIM-TRUTH-1`
- **Status:** `scoped`
- **Priority:** Medium. The claims are false and reach four live routes, but no decision currently
  turns on them, so this corrects an untruth rather than a malfunction.
- **Dependencies:** none. It needs no operator Studio session and no Roblox Open Cloud credential
  surface, which is what makes it startable while the roadmap board is blocked.
- **Control-plane entry:** **yes, now.** The audit has already proved production reach — four mounted
  routes, a client-supplied value re-reported as health, and a fabricated passing score for
  unsimulated games. `PLAYTEST-TRUTH-1` set the precedent that an audit-discovered correction to
  shipping behaviour is recorded as a delivery item rather than left informal. The completion boundary
  must be written the same way, so that removing a fabricated aggregate is never read as having added
  a measurement capability.

## What was delivered

Every point of the proposal above was implemented in the pull request carrying this record.

- `SimulationEvidenceReport` declares `schemaVersion` and `evidenceKind: "deterministic-simulation"`,
  and separates `observed` counts from `derived` ratios, with `player: { status: "not-observed" }`.
- `engagementScore` is gone and no aggregate replaces it, asserted by test.
- `SimulationSchedule` records what the walk could reach; every finding carries an `attribution`, and
  a shortfall the schedule caused is never asserted against the blueprint nor counted toward
  regeneration.
- The letter grade and its weights are gone. `RegenerationDecision` names a versioned `policyId`, its
  reason and the evidence it read, and abstains when the run could not test the blueprint.
- `?? 70`, the economy `50` and the zero-NPC `1` are removed. `GameHealthMonitor.assess` returns
  `insufficient-evidence` naming what was missing, records nothing in history, and reports no trend
  on a first reading. `retentionSimulated` is gone.
- `/lifecycle/tick` echoes caller data under `clientClaims`, never promotes it to evidence, and
  abstains from evolution rather than running on a default.
- `decodeSimulationEvidenceReport` refuses a legacy or malformed report at `POST /api/simulate/feedback`.

**Corrections found during implementation and review.** The audit reported that no decision turned on
the score; that held for `shouldRegenerate` but not for lifecycle, where the fabricated composite
selected an evolution branch and patched the blueprint. Review then found that a blueprint declaring
no mechanics was attributed to the simulator's schedule when it is a property of the blueprint; that
the rewritten NPC rule could never fire, because the walk marks every NPC it indexes; that a
zero-tick run reported one tick; that duplicate mechanic names made the reach ceiling exceed the
countable mechanics; and that the versioned `CompileResponse` still promised `engagement: number`.
All are fixed.

**Known limitation, stated rather than papered over.** No server-owned simulation, economy or world
evidence source is reachable from `/lifecycle/tick` — all three arrive in the request body — so the
route now always reports `insufficient-evidence`, never evolves, and leaves a game in `CREATED`. The
response says so explicitly under `lifecycleAdvance`. Building that evidence source is a separate
slice; inventing one here would restore the defect this removes.

## Whether implementation was worth starting

Yes, with its priority stated honestly. It is the only bounded work on or off the board that is
startable without the paused Studio session or the absent credential surface, it is directly
continuous with a slice just completed, and the audit is done. But it fixes claims, not behaviour: no
generation or lifecycle outcome changes, because the one decision that reads the score cannot fire.
If a slice that changes what the platform _does_ is worth more than one that changes what it _says_,
this should wait — and in that case the honest answer remains that the board is blocked.
