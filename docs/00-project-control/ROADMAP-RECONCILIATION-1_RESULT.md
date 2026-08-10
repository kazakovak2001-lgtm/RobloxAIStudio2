<!-- prettier-ignore-start -->

# ROADMAP-RECONCILIATION-1 — Roadmap reconciled against merged reality

**Status:** Complete. Documentation and control-plane only; no runtime code was changed.
**Reconciled at:** backend `release/cutover-1e-candidate@e05f34a68e9a62042d2bf4f82531552ac8f61341`, canonical Frontend `kazakovak2001-lgtm/Frontend@94736069e049b9614c4012775677c78777f5060d`.

This record is the evidence for the statuses in [ROADMAP_STATUS.md](./ROADMAP_STATUS.md). The roadmap remains the ordered delivery authority; this document explains how each status was reached and names every conflict found. Where the two disagree, the roadmap is authoritative for *what is next* and this record is authoritative for *why a status is what it is*.

## Status vocabulary

Exactly one value per item. The distinctions are load-bearing and are not collapsed.

| Value | Meaning |
|---|---|
| `complete` | Merged, and every kind of evidence its own scope required exists |
| `code_complete_evidence_pending` | Merged and contract-tested, but evidence its scope requires does not exist yet |
| `partial` | Some declared sub-scope merged, some not |
| `scoped` | A scope record exists; implementation has not started |
| `blocked` | Cannot start until a named, enumerable condition holds |
| `deferred` | Deliberately postponed with no target |
| `unscoped` | Named as an ordering marker only; no scope record |
| `obsolete` | Superseded by a decision, not by another slice |
| `superseded` | Replaced by a named successor |
| `unverified` | Referenced somewhere, but repository evidence does not establish its state |

## Backend inventory

| ID | Status | Evidence |
|---|---|---|
| `CUTOVER-0` | `complete` | Merged; Frontend governance and CI alignment |
| `CI-BASELINE-1` | `complete` | Merged |
| `CORE-1` | `complete` | Merged; [1A](./CORE-1A_DURABLE_PROJECTS.md), [1B](./CORE-1B_DURABLE_RUNTIME.md) |
| `WORKSPACE-1` | `complete` | Merged; Frontend-side scope records |
| `STUDIO-1` | `complete` | Merged; decomposed 1A–1G, all recorded |
| `CUTOVER-1` | `complete` | Merged; [1A](./CUTOVER-1A_BACKEND_RELEASE_ARTIFACT.md), [1C](./CUTOVER-1C_COMPOSED_RELEASE.md), [1D](./CUTOVER-1D_RELEASE_BASELINE_READINESS.md) |
| `TECH-AUDIT-2` | `complete` | Dated historical evidence baseline; not a live plan |
| `HARDEN-2A` | `complete` | Merged |
| `ARCH-2B` | `complete` | Merged; boundary gate runs in CI |
| `FRONTEND-2C` | `complete` | Merged in the Frontend repository |
| `RUNTIME-2D` | `complete` | Merged; `validate:runtime` gate |
| `DURABILITY-2E` | `complete` | Merged; `validate:durable-writes` gate |
| `SECURITY-2G` | `complete` | Through `SECURITY-2G-F`, PR #162 |
| `DOC-202` | `complete` | Through `DOC-202A`; the authority validator runs pre-commit and in CI |
| `ROADMAP-AUDIT-1` | `complete` | The predecessor of this pass |
| `STUDIO-ACCEPT-1` | `complete` | [Operator-observed acceptance](./STUDIO-ACCEPT-1_DESKTOP_ACCEPTANCE_RESULT.md) with exact receipts |
| `RUNTIME-PLAYTEST-1` | `complete` | [Operator-observed](./RUNTIME-PLAYTEST-1_RESULT.md); narrative evidence, not a machine-verified receipt trail — recorded as such |
| `REPAIR-1` | `complete` | Backend 1A/1B/1C (PR #185/#187/#189) plus Frontend PR #40 |
| `PROVIDER-1A` | `complete` | PR #193 |
| `PROVIDER-1B` | `complete` | PR #200 |
| `ARTIFACT-1` | `code_complete_evidence_pending` | PR #199; plugin Lua, no Lua execution harness, no Studio-attached run |
| `SECREVIEW-1` | `complete` | PR #201; **advisory** — a finding never negates delivery |
| `SECURITY-REVIEW-A2` | `complete` | PR #216; **advisory**; hardening only |
| `SECURITY-REVIEW-B` | `blocked` | Seven [promotion criteria](./SECURITY-REVIEW-B_PROMOTION_CRITERIA.md), **zero satisfied**. Also has no scope record |
| `PIPELINE-1A` | `complete` | PR #203 |
| `PIPELINE-1B` | `complete` | PR #205 |
| `PIPELINE-1C` | `unscoped` | Deliberate: nothing needs to skip a stage, and a branch with no consumer is scaffolding |
| `WORLD-1A` | `complete` | PR #207; non-canonical, unmaterialized, advisory |
| `WORLD-1B` | `code_complete_evidence_pending` | PR #209/#210; contract tested, [scope](./WORLD-1B_SCOPE.md) names the outstanding operator session |
| `WORLD-1C` | `blocked` | [Scoped](./WORLD-1C_SCOPE.md) and blocked on operator-observed `WORLD-1B`. **Not** blocked on `STUDIO-2F-E` |
| `AGENT-CONTRACT-1` | `complete` | PR #212; [scope](./AGENT-CONTRACT-1_SCOPE.md) |
| `ARTIFACT-CONTRACT-2` | `complete` | PR #214; [scope](./ARTIFACT-CONTRACT-2_SCOPE.md) |
| `STUDIO-SYNC-1A` | `complete` | Backend PR #176, Frontend PR #34/#37 |
| `STUDIO-2F` | `superseded` | Replaced by its own `STUDIO-2F-A`…`STUDIO-2F-E` decomposition (PR #192) |
| `STUDIO-2F-A` | `code_complete_evidence_pending` | PR #195/#196/#197; [scope](./STUDIO-2F-A_SCOPE.md) requires runtime validation that has not run |
| `STUDIO-2F-B` | `blocked` | Requires a Roblox Open Cloud credential surface that does not exist |
| `STUDIO-2F-C` | `unscoped` | Begins with a delivery-mechanism decision not yet taken |
| `STUDIO-2F-D` | `unscoped` | Ordering marker only |
| `STUDIO-2F-E` | `unscoped` | Ordering marker only; must be applied atomically when scoped |
| `AUTONOMY-3A` | `deferred` | No target; control gates named historically are now all complete, so the deferral is a choice rather than a blocker |
| `COLLAB-3B` | `deferred` | No target |

## Frontend inventory

Canonical Frontend is the separate `kazakovak2001-lgtm/Frontend` repository.

| Item | Status | Evidence |
|---|---|---|
| `CUTOVER-1B` frontend SSR release | `complete` | Frontend `docs/CUTOVER-1B_FRONTEND_SSR_RELEASE.md` |
| `WORKSPACE-1` frontend scope records | `complete` | Six `WORKSPACE-1_*.md` records |
| `FRONTEND-2C` | `complete` | Quality and bundle baseline |
| `STUDIO-SYNC-1A-FE` | `complete` | Frontend PR #34/#37 |
| `REPAIR-1` frontend UI | `complete` | Frontend PR #40 |
| Frontend corrective series, PR #42 | `complete` | Stale mutation writing another project's state |
| Frontend corrective series, PR #43 | `complete` | Stale project async results corrupting `ChatPanel` |
| Frontend corrective series, PR #44 | `complete` | Cross-project state leaks in workspace data and modules |
| Frontend corrective series, PR #45 | `complete` | Fabricated agent status/progress and generation state |
| `FRONTEND-FIX-1`, `-2`, `-3` | `unverified` | **No such identifier exists in either repository.** See the ambiguity section |
| `FRONTEND-AUDIT-2` | `unverified` | **No such identifier exists in either repository.** See the ambiguity section |

## Conflicts found

### 1. The verified release pair excludes four merged Frontend corrections — material

`config/cutover/release-baseline.inventory.json` pins Frontend `6c1458d8…`, and backend CI checks out **that exact commit** for the Frontend Production Contract and composed-release jobs. Canonical Frontend `main` is `94736069…`, four merged PRs ahead (#42, #43, #44, #45).

This is not documentation drift. The pinned pair is genuinely verified — against a Frontend that no longer matches `main`. Both facts are true and must be stated together: **the pair is current as a pair, and `main` has moved beyond it.** Advancing the pin requires a paired-release run, which is a separate slice.

### 2. The Frontend's own pin names a backend 85 commits behind — material

Frontend `config/integration/paired-release.json` pins backend `ccd28ef8…`, which is PR #190 (the REPAIR-1C reconciliation). The backend release branch is 85 commits ahead of it. Every backend slice from `PROVIDER-1A` onward is outside the Frontend's declared pair.

The two repositories therefore disagree about what the pair is. The backend record is the more current of the two; neither is wrong about its own side, and both are stale about the other.

### 3. `CURRENT_STATE.md` described the pinned Frontend as `main` — corrected here

It read `Frontend@6c1458d8… (main, merged PR #40 …)`, which was true when written and now implies `main` still points there. Corrected to name the pinned contents and the current `main` separately.

### 4. Naming collisions that invite misreading — recorded, not renamed

- `ARTIFACT-1` (Studio *instance* identity) and `ARTIFACT-CONTRACT-2` (durable *backend* envelope) are unrelated concerns one digit apart. The `ARTIFACT-CONTRACT-2` scope record already disambiguates them explicitly.
- `SECREVIEW-1`, `SECURITY-REVIEW-A2` and `SECURITY-REVIEW-B` use two different prefixes for one subject.

Renaming merged slices would break pinned claims and merged-PR references for no functional gain. Recorded so a reader is not surprised.

### 5. A parallel, non-authoritative spec tree

`.kiro/specs/**` holds eight feature specs with `tasks.md` checklists; seven still contain unchecked items. These are not referenced by `ROADMAP_STATUS.md` and are not part of the delivery sequence. Classified `obsolete` as *roadmap authority* — they are historical working notes, and no status in this reconciliation derives from them.

## Dependency and blocker graph

One operator session gates **one path** through the Studio work — `ARTIFACT-1`, `STUDIO-2F-A` and `WORLD-1B`, and through `WORLD-1B` the blocked `WORLD-1C`. It does **not** unblock the rest: `STUDIO-2F-B` is independently blocked by the absence of a Roblox Open Cloud credential surface, and `STUDIO-2F-C`, `-D` and `-E` are unscoped. Completing the session is necessary for that path and sufficient for nothing else.

```
                    ┌─ ARTIFACT-1 ──────────┐
operator Studio ────┼─ STUDIO-2F-A ─────────┼── all three: code_complete_evidence_pending
   session         └─ WORLD-1B ────────────┘
   (PAUSED)                 │
                            └──> WORLD-1C            (blocked)
                                    │
STUDIO-2F-A ──> STUDIO-2F-B (blocked: no Open Cloud credential surface)
           └──> STUDIO-2F-C / -D / -E                (unscoped)

SECREVIEW-1 + SECURITY-REVIEW-A2 ──> SECURITY-REVIEW-B (blocked: 7 criteria, 0 satisfied)

Frontend main (94736069) ──> paired-release advance   (not scoped; see conflict 1 and 2)
```

**Studio acceptance is paused by the operator.** Nothing in this pass attempts to close those evidence gaps, and no status above was upgraded on the strength of code alone.

## Unresolved ambiguity

**`FRONTEND-FIX-1`, `FRONTEND-FIX-2`, `FRONTEND-FIX-3` and `FRONTEND-AUDIT-2` do not appear anywhere in either repository** — not in documents, commit messages, branch names, PR titles or configuration. Four corrective Frontend PRs (#42–#45) are merged and one plausible reading is that they are that series, but assigning those identifiers to those PRs would be assumption, which this pass is required not to make. There are **zero** open Frontend PRs and no branch that looks like work in progress, so nothing supports an in-progress `FRONTEND-FIX-3`.

The four PRs are recorded above by number and subject, which is what the repository actually evidences. If those identifiers exist in an external tracker, the mapping should be supplied and recorded rather than inferred.

Likewise, the remaining `FRONTEND-AUDIT-2` findings could not be inventoried as future slices, because no such audit exists in the repository to enumerate them from.

## Recommended next five bounded slices

Ordered, each independently reviewable, none requiring Studio.

1. **`PAIR-ADVANCE-1`** — run the paired-release verification against Frontend `94736069…` and advance both pin authorities, resolving conflicts 1 and 2. The highest-value item, because every later claim about the pair inherits this staleness.
2. **`FRONTEND-PIN-1`** — make the Frontend's `paired-release.json` backend SHA reconcile against the backend's release branch in CI, so the two repositories cannot silently disagree again.
3. **`SECREVIEW-CONFIDENCE-1`** — add a confidence classification to security findings. Promotion criterion 4 names it explicitly, and it is the only one of the seven that is a bounded code change rather than a data-gathering exercise.
4. **`SECREVIEW-SAMPLE-1`** — measure the reviewer's false-positive rate over real generations, satisfying criteria 1 and 2. Data gathering, no product code.
5. **`PIPELINE-VALIDATION-GATE-1`** — consume the existing `allApproved` review state before delivery, which `ARTIFACT-CONTRACT-2` recorded as authoritative-but-unenforced.

Everything Studio-shaped stays where it is until the operator session happens.

<!-- prettier-ignore-end -->
