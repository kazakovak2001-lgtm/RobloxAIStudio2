<!-- prettier-ignore-start -->

# ROADMAP-EXTENSION-1 — Autonomous Roblox Development Platform

**Status:** Roadmap extension only. **Nothing here is implemented, scoped, or started.**
**Baseline:** the reconciled roadmap from [ROADMAP-RECONCILIATION-1](./ROADMAP-RECONCILIATION-1_RESULT.md), which is the authority for what exists today.

Every item below is `unscoped` — named and ordered so the direction is legible, and deliberately without a scope record, because a scope written before its prerequisites exist would be fiction. Each becomes `scoped` only when the work in front of it is done and someone writes its scope against the platform as it then is.

## Principles these extensions inherit

They are not restated per item; they constrain all of them.

**PLATFORM FIRST. AGENTS SECOND.** Deterministic infrastructure owns authority, persistence, lifecycle, validation, audit, recovery and promotion. AI proposes, reasons and generates; it does not silently override a platform invariant. Where the two disagree, the platform wins and says so.

**No template-driven creative engine.** The platform must not become a catalogue of genres with parameters. This is why `NOVELTY-1` compares mechanics, system graphs, progression and economy structure rather than names, themes or assets — two games can share every asset and be different games, and share no assets and be the same one.

**Everything durable carries identity.** Identity, producer, version, content hash, dependencies, validation evidence and review status. `ARTIFACT-CONTRACT-2` established that for pipeline artifacts; every extension that produces a durable output inherits it rather than inventing a parallel envelope.

**Unknown is a valid state.** Never fabricate success, progress or agent status. A system that cannot tell "checked and fine" from "did not check" is worse than one that admits the gap — `SECURITY-REVIEW-A2` had to correct exactly that, and every extension below is capable of the same failure.

## Strategic sequencing

The order is a dependency claim, not a preference. Each stage needs the one before it to be trustworthy, because a loop built on an untrustworthy signal amplifies the untrustworthiness.

1. **Finish the trustworthy core generation lifecycle** — largely done: `PROVIDER-1A/1B`, `PIPELINE-1A/1B`, `AGENT-CONTRACT-1`, `ARTIFACT-CONTRACT-2`.
2. **Finish validation and security truthfulness** — `SECREVIEW-1` and `SECURITY-REVIEW-A2` are advisory; `SECURITY-REVIEW-B` is blocked on seven criteria, none satisfied.
3. **Finish the real playtest → diagnose → repair loop** — `REPAIR-1` is complete; runtime playtest evidence is operator-observed and narrow.
4. **Add the GameDNA and originality foundation** — `NOVELTY-1`, `NOVELTY-2`.
5. **Expand runtime and multiplayer playtesting** — `PLAYTEST-2`, `PLAYTEST-3`, `PLAYTEST-4`.
6. **Establish multimodal asset contracts** — `ASSET-FABRIC-1`, `ASSET-FABRIC-2`.
7. **Add synthetic player and economy simulation** — `PLAYER-SIM-1`, `ECONOMY-SIM-1`.
8. **Add the analytics and experiment closed loop** — `ANALYTICS-2`, `EXPERIMENT-1`.
9. **Expand multi-place and remote operations** — `MULTIPLACE-1`, `REMOTE-OPS-1`.

`UI-QUALITY-1`, `PERF-AGENT-1`, `STORE-INTEL-1` and `AGENT-SAFETY-1` are cross-cutting and attach where their inputs exist rather than occupying a stage of their own. `AGENT-SAFETY-1` is the exception worth naming early: it governs every other item, and the later it lands the more it has to retrofit. It is therefore listed **before** `REMOTE-OPS-1`, which declares it as a dependency — an ordered table that lists a dependant above its prerequisite is telling a reader to start in the wrong place.

## The extensions

### Originality

| ID | Item | Depends on | Note |
|---|---|---|---|
| `NOVELTY-1` | GameDNA and structural similarity fingerprint | `WORLD-1A`, `ARTIFACT-CONTRACT-2` | A fingerprint over mechanics, system graph, progression and economy structure. The world model already derives semantic roles from generated output; this is the first consumer that compares two generations to each other rather than to their own spec |
| `NOVELTY-2` | Cross-generation novelty gate | `NOVELTY-1` | Advisory before blocking, as `SECREVIEW-1` was. A novelty gate that blocks on a fingerprint nobody has measured would reject real work on unmeasured confidence |

### Playtesting

| ID | Item | Depends on | Note |
|---|---|---|---|
| `PLAYTEST-2` | Visual and input-aware autonomous player | operator-observed Studio evidence | Needs a runtime harness the repository does not have. `RUNTIME-PLAYTEST-1` was operator-observed and narrow |
| `PLAYTEST-3` | Runtime server/client and multi-client testing | `PLAYTEST-2` | Where client-authority defects become observable rather than inferred. `SECREVIEW-1` finds the shape of an exploit; this would find whether it fires |
| `PLAYTEST-4` | Player persona swarm | `PLAYTEST-3` | Many concurrent synthetic players with different behaviour profiles |

### Content

| ID | Item | Depends on | Note |
|---|---|---|---|
| `ASSET-FABRIC-1` | Unified multimodal asset contract | `ARTIFACT-CONTRACT-2` | The envelope generalised to meshes, textures, rigs, animation, VFX and SFX. Contract first, pipeline second, deliberately |
| `ASSET-FABRIC-2` | Mesh, texture, rig, animation, VFX and SFX pipeline | `ASSET-FABRIC-1`, `STUDIO-2F-B` | Blocked in practice by the same missing Open Cloud credential surface that blocks `STUDIO-2F-B` |

### Simulation

| ID | Item | Depends on | Note |
|---|---|---|---|
| `PLAYER-SIM-1` | Synthetic player population | `PLAYTEST-4` | Populations rather than sessions |
| `ECONOMY-SIM-1` | Synthetic economy simulation | `PLAYER-SIM-1` | An economy simulated without players is a spreadsheet; the ordering is not arbitrary |

### Measurement

| ID | Item | Depends on | Note |
|---|---|---|---|
| `ANALYTICS-2` | Diagnostic analytics | `PLAYTEST-3` | Diagnostic, not vanity: the question is why a generation failed, not how many ran |
| `EXPERIMENT-1` | Controlled AI-assisted experimentation | `ANALYTICS-2`, `NOVELTY-1` | Controlled comparison needs a stable metric and a stable notion of difference. Both must exist first |

### Quality

| ID | Item | Depends on | Note |
|---|---|---|---|
| `UI-QUALITY-1` | Responsive, accessibility and localization validation | `STUDIO-2F-A` operator evidence | Deterministic where it can be; a UI tree already exists to check against |
| `PERF-AGENT-1` | Profiler-driven optimization | `PLAYTEST-3` | Needs real runtime measurements. Optimising against a static heuristic is what `PlaytestEngine` already does and what the audit flagged |

### Ecosystem and control

| ID | Item | Depends on | Note |
|---|---|---|---|
| `STORE-INTEL-1` | Creator Store semantic retrieval, compatibility and security scoring | `ASSET-FABRIC-1`, `SECREVIEW-1` | Third-party content is untrusted input. Scoring it is a security surface, not a search feature |
| `MULTIPLACE-1` | Whole-universe and multi-place orchestration | `STUDIO-2F-C` | Needs place delivery, which is unscoped |
| `AGENT-SAFETY-1` | Observe / Plan / Propose / Execute permission model | `AGENT-CONTRACT-1` | The one to bring forward. `AGENT-CONTRACT-1` gave agents versioned definitions; this gives them bounded authority, and everything above becomes safer for existing |
| `REMOTE-OPS-1` | Web and mobile agent control plane | `AGENT-SAFETY-1` | Remote control without a permission model is remote control of an unbounded agent |

## What this does not change

No existing status moved. `ARTIFACT-1`, `STUDIO-2F-A` and `WORLD-1B` remain `code_complete_evidence_pending`; `WORLD-1C` and `SECURITY-REVIEW-B` remain `blocked`; Studio acceptance remains paused. No extension above is scoped, and none may begin before the stage it sits in.

<!-- prettier-ignore-end -->
