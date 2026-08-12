<!-- prettier-ignore-start -->

# PLAYTEST-TRUTH-1 — stop presenting heuristic static analysis as measured playtest quality

**Status:** Scoped. Backend-only; no Roblox Studio evidence is required or claimed.
**Depends on:** nothing. It corrects what already ships.
**Complexity:** M. **Risk:** Medium — it changes a decision the repair loop makes, so the replacement condition has to be at least as bounded as the one it removes.

**How this item exists.** It was not on the roadmap. It comes from the platform audit's unactioned findings, and it was raised after the roadmap ran out of genuinely startable work: every remaining item is gated either on the paused operator Studio session or on the Roblox Open Cloud credential surface that does not exist. That is the rationale for adding it now — not that it is more important than the blocked items, but that it is real, bounded, needs neither gate, and corrects an active untruth.

**This does not complete `PLAYTEST-2`.** No runtime play session, no input simulation, no visual verification. `PLAYTEST-2` remains the future real runtime capability and remains blocked on operator-observed Studio evidence. After this slice the platform measures *less* and claims *much* less.

## Audit findings

Read from the implementations at `6079392f0718066a0de6b26b3fb87765f2589ce9`.

### Where the number is produced

`PlaytestEngine.run()` averages six sub-scores into `overallScore`, then labels the result:

| Sub-score | How it is produced | Real? |
|---|---|---|
| `architecture`, `assets`, `dependencies`, `gameplay` | `100 − 25×critical − 10×warning − 3×other` | Findings are real; the weights are invented |
| `lua` | `80`, `+10` if ≥5 scripts, `+5` if any source contains `pcall`, `+5` if any contains `--[[` | **Entirely invented. Reads no findings at all** |
| `performance` | `90` / `70` / `50` by `estimatedInitTimeMs` under 3000 / 5000 / above | Invented bands over an estimate |

`classification` is then `production_ready` at ≥80, `needs_work` at ≥50, `critical_issues` below. **A generated game is called production-ready because its source contains a `pcall` and a block comment.**

The underlying rules are genuinely deterministic and worth keeping — remote-event checks, ModuleScript placement, circular dependencies, script placement, asset and configuration checks. The findings are real. Only the arithmetic on top of them is not.

### Where it changes behaviour

Three places, and the repair path is the one that matters:

1. **`RepairEngine` decides whether to repair at all**: the loop runs while `session.currentScore < cfg.targetScore`. A game whose heuristic total happens to clear the target is never repaired, however many findings it has.
2. **`RepairEngine` decides why it stopped**: `currentScore >= targetScore` sets status `completed` with the reason `"Target score reached"` — a claim about quality nobody measured.
3. **`RepairPlanner` decides what to repair**: `decide(issue, report.overallScore, targetScore)` skips a `suggestion` when `currentScore >= targetScore − 5`, and forces `repair` when `targetScore − currentScore > 15`. The plan itself bends around the invented number.

**A repair can be recorded as an improvement without resolving anything.** `scoreAfter` is recomputed from the regenerated source, so Lua that newly contains `pcall` scores five points higher with the same findings outstanding.

### Where it is durable

`RepairSessionState.currentScore` and `targetScore`, and `RepairIterationRecord.scoreBefore` and `scoreAfter`, are persisted through `StorageRepairSessionStore`. Historical rows exist and must stay readable.

`PlaytestReport` itself is **not** persisted by this path — `PlaytestEngine` holds reports in a process-local `Map`, so `GET /api/playtest/:projectId` returns 404 after a restart. That is a separate defect and is recorded, not fixed here.

### What is already honest

`AutonomousPhaseRegistry` labels this evidence `"heuristic"` and states plainly that *"PlaytestEngine performs deterministic static analysis, not a Roblox runtime play session."* That path needs no correction beyond the fields it reads, and it is the model the rest of this slice follows.

### Not this module

`server/src/artifacts/GameArtifact.ts` imports a **different** `PlaytestReport` from `simulation/agents/PlaytestAgent`. Out of scope; recorded so a later reader does not assume it was covered.

## The contract

`PLAYTEST_REPORT_SCHEMA_VERSION = 2`.

- `evidenceKind: "static-analysis"` — stated on every report, so a consumer never has to infer what produced it.
- `runtime: { status: "not-measured", reason }` — runtime quality is explicitly unmeasured, never absent, never zero, never a default.
- `findings` and `findingCounts` — the deterministic results, kept.
- `systems[]` — per category, finding counts plus a status derived only from them: `fail` if any critical, `warn` if any warning, otherwise `pass`. A restatement of findings, not a magnitude.
- **Removed:** `overallScore`, `classification`, `scores`, and `scoreLua` entirely.

`performance` stays, because it is already named as an estimate and nothing scores it.

## Repair decision, before and after

| | Before | After |
|---|---|---|
| Iterate while | `currentScore < targetScore` | actionable findings exist |
| Completed when | `currentScore >= targetScore`, reason `"Target score reached"` | no actionable findings remain, reason `"No actionable deterministic findings remain"` |
| Stops with | `"No actionable repairs remaining"` / attempt limit / timeout | `"No actionable deterministic findings remain"` / attempt limit / timeout, each stated |
| Plan decisions | bend around `overallScore` vs `targetScore` | severity alone |
| Improvement | `scoreBefore` vs `scoreAfter` | findings resolved, findings remaining |

**The attempt ceiling is unchanged and independent.** `attemptIterations = min(maxIterations, 1)` and the timeout both remain, so removing the numeric target cannot produce an unbounded loop — the ceiling never depended on the score.

## Legacy semantics

- `scoreBefore`, `scoreAfter`, `currentScore` and `targetScore` remain readable on historical records and are documented as **legacy heuristic values, never measurements**.
- New records carry `evidenceKind` and a schema version; a record without them is legacy by definition and is never relabelled.
- Decoding distinguishes the two, and a legacy numeric value can never be read as a measured score.

## Out of scope

Roblox runtime playtest automation, visual verification, input simulation, multiplayer or persona simulation, Studio acceptance, `PLAYTEST-2`/`3`/`4`, any ML or LLM scoring, any replacement quality formula, any tuned threshold, and Frontend redesign beyond what a now-removed field forces.

The process-local report `Map` and the `simulation/agents/PlaytestAgent` report are recorded above and not fixed here.

## Testing strategy

The heuristic making no measured-quality claim; no runtime evidence yielding an explicit not-measured state; findings still available; repair iterating when findings are actionable; repair stopping truthfully when none are; the attempt ceiling still terminating; no unbounded loop once the target is gone; a historical record decoding as legacy heuristic rather than measurement; a new record refusing to deserialize as measured without measured evidence; before/after not implying improvement on heuristic evidence alone; the read model preserving not-measured rather than fabricating a number; and durable persistence preserving the evidence kind. Each verified by mutation.

## Rollback strategy

The report shape changes, so a revert restores the previous fields and the previous repair condition. Durable repair rows written under this slice carry finding counts and an evidence kind; reverting leaves those keys unread rather than misread.

<!-- prettier-ignore-end -->
