<!-- prettier-ignore-start -->

# WORLD-1C — Canonical Runtime World Ownership

**Status:** Scoped and unblocked. **One preparatory slice is implemented; the ownership switch is not.** The operator-observed prerequisite was satisfied on August 15, 2026. See [Implemented so far](#implemented-so-far).
**Depends on:** `WORLD-1A` and complete `WORLD-1B`, including operator-observed Studio acceptance.
**Does not depend on:** `STUDIO-2F-E`. WORLD-1C moves world structure only and leaves the HUD contract untouched.

## Objective

Move ownership of the runtime world from the imperative Lua that builds it into `Workspace` today, to the typed WORLD scene, so that Lua binds to semantic entities and owns only gameplay behaviour.

## The prerequisite gate, now satisfied

**WORLD-1C was not permitted to begin until `WORLD-1B` had been observed working in a real Roblox Studio session.** The [deferred Studio acceptance result](./STUDIO-DEFERRED-ACCEPTANCE_RESULT.md) now records all six criteria passing, including a changed-design managed sweep.

This was not generic caution about a new feature. At scoping time the audit found:

1. **The materializer has never run.** `WorldSceneMaterializer.lua` is contract-tested only. There is no Lua execution harness in this repository, so nothing has ever observed it create an instance, set an attribute, or return a path. Its own tests label that plainly.
2. **Today the Lua world is the safety net.** If the materializer silently fails, nothing is lost, because the generated server `Script` still builds the world. WORLD-1C removes that net: the world a player sees would come *only* from code no one has ever seen run.
3. **The switch invalidates the platform's sole runtime evidence.** `RUNTIME-PLAYTEST-1` is an operator-observed Play-mode result over a **Lua-created** world — a `GeneratedAdventure` Workspace folder with a spawn pad and five orbs. Under materialized-world ownership that evidence describes a world the platform no longer builds that way, and there is no replacement evidence.
4. **The same change would weaken the only gate that has held.** `getPlayableLuaIssues` is the fail-closed contract on every path into Studio — generation, the recorder, the v2 pipeline and repair acceptance. WORLD-1C necessarily replaces its world-creation rules with binding rules. Relaxing the one proven gate in the same change that introduces an unproven world source concentrates two risks in one step.

Before acceptance, shipping it would have made an unobserved materializer the only world source while relaxing the proven gate and invalidating the only runtime evidence. The acceptance removes that prerequisite blocker. It does not itself implement mode-aware ownership, replace the runtime playtest, or satisfy the remaining design obligations in this scope.

### Prerequisite

**Satisfied August 15, 2026.** One operator-observed Studio session confirmed `WORLD-1B`: the scene appeared under `ReplicatedStorage.AIStudioArtifacts.WORLD_MODEL` with the expected zones, entity models, and `AIStudioWorldEntityId` / `AIStudioWorldRole` attributes; re-export replaced rather than duplicated; a hand-added instance survived; a name collision failed without destroying creator work; and a changed design swept the disappeared managed `mechanic-5`. The six-point checklist is in [WORLD-1B_SCOPE.md](./WORLD-1B_SCOPE.md).

That session also closed the `ARTIFACT-1` and `STUDIO-2F-A` evidence because all three deliveries touch the same plugin.

## Audit findings

### 1. The playability contract

Fifteen rules. **Three** assume Lua builds the world, and those are the only ones WORLD-1C may touch:

| Rule | Assumes | WORLD-1C |
|---|---|---|
| `server code must create playable world instances` | `Instance.new` **and** `workspace` in server source | replaced by a binding rule |
| `one server Script must own the complete world, objective, and progress event` | **one** script containing world creation, an interaction, a `RemoteEvent` and a fire call | replaced: world creation drops out, the rest stays |
| `server code must implement a gameplay interaction` | a `Touched`/`Activated`/`Triggered`/`MouseClick`/`OnServerEvent` connection | kept, and re-expressed against bound entities |

The HUD rules — `client code must create a visible ScreenGui`, `must attach the HUD to PlayerGui`, `one client LocalScript must create the HUD before observing progress` — and `server and client code must connect objective progress to the HUD` **are not world-ownership rules**. They constrain the client HUD and the progress channel, neither of which changes when world structure moves. WORLD-1C preserves them unchanged in both modes; flipping HUD ownership is `STUDIO-2F-E` and is not part of this delivery.

**Dependency, stated precisely:** WORLD-1C requires observed `WORLD-1B` evidence. It does **not** require `STUDIO-2F-E`, because it leaves the HUD contract alone. Earlier records said otherwise and have been corrected.

Callers: `LuaGeneratorAgent` (four post-validation sites), `GenerationArtifactRecorder` (blocking), `PipelineExecutor` (v2 report), `RepairExecutor` (repair acceptance). **Changing these rules changes what every one of those paths accepts.**

### 2. LuaGeneratorAgent

World creation, gameplay, objective logic, remotes, leaderstats and HUD communication are deliberately fused into one server script, because rule 3 above requires it. Both the model prompt (`create at least one Folder or Part with Instance.new and parent the generated world to workspace`) and the deterministic `playableFallback` build a `GeneratedAdventure` folder in `workspace`. Under WORLD-1C both must be rewritten to bind instead of build — including the fallback, which is what guarantees a playable package when a provider is absent or unusable.

### 3. WORLD-1A model

Expressible: entities and systems with stable semantic ids, roles, relationships, dependencies, constraints. Not expressible: geometry, quantities beyond a declared count, behaviour, and any notion of *where* something is. A runtime world built from this model is therefore a set of role-tagged markers, not a playable space — the model would have to grow before it can describe a world worth entering.

### 4. WORLD-1B materialization

Delivers into `ReplicatedStorage.AIStudioArtifacts.WORLD_MODEL`; zones by role; entity models carrying `AIStudioWorldEntityId`, `AIStudioWorldRole` and relations; `AIStudioManaged` ownership with unmanaged collisions failing closed; validate-whole → build-detached → attach; receipts pair entity id with instance path and the backend derives expected paths from the transferred artifact. **All of it unobserved at runtime.**

### 5. RepairEngine

`RepairExecutor` regenerates the whole Lua package and accepts it only when `getPlayableLuaIssues` is empty. It has no concept of ownership mode, so a repair of a materialized-world execution would today regenerate world-building Lua and be accepted — producing exactly the two-owner state WORLD-1C forbids.

### 6. Runtime playtest

`RUNTIME-PLAYTEST-1` evidence is entirely Lua-created world objects. It cannot carry over.

### 7. Studio delivery and rollback

`ProjectSyncManager` selects the newest completed artifact-bearing execution, and repair redelivery can push an **older** execution. Redelivering a `lua-owned` execution into a place that already holds a materialized world would leave managed world instances standing while Lua rebuilds its own — two owners, from an ordinary rollback. WORLD-1C therefore needs mode-aware sweeping on delivery, which is more unobserved plugin code.

### 8. Cross-artifact validation

`crossValidateWorld` currently asks whether Lua *constructs* what a role requires. Under materialized-world mode the questions change to whether Lua *references* and *interacts with* an entity. Those are different evidence classes and must be reported separately, with anything unsettled remaining `unverifiable` — a string appearing in source is not proof of a binding.

## Target ownership

| | Before | After |
|---|---|---|
| World structure | Generated server `Script`, at run time, into `Workspace` | Materialized WORLD scene, in `Workspace` |
| Gameplay, state, interactions | Same script | Lua, bound to semantic entities |
| Design-time scene | `ReplicatedStorage.AIStudioArtifacts.WORLD_MODEL` | Unchanged, or promoted |

**Binding invariant:** at every accepted execution, exactly one component owns runtime world structure. Never both, not even temporarily on an accepted path.

## Ownership mode

No existing field expresses this. `pipeline_definition` / `pipeline_version` describe which stages ran; `ai_mode` describes authorship; the `VALIDATION` report describes findings. None says who owns the world.

Recommended: `worldRuntimeMode: "lua-owned" | "materialized-world"` on the durable execution **and** on the WORLD artifact, so an artifact package is self-describing after transfer. Not added in this delivery: a field with one legal value is scaffolding, and the second value cannot exist until the prerequisite is met.

**Backward compatibility must be explicit.** Executions recorded before WORLD-1C have no mode and are `lua-owned` by construction; they must remain readable, re-deliverable and valid under the old rules. Nothing may reinterpret a historical execution as WORLD-1C.

## Rollback strategy

Redelivery of an older execution must carry its own mode, and the plugin must sweep managed world instances when the delivered mode is `lua-owned`. Without that, rollback creates the two-owner state directly. This is why WORLD and Lua must travel as one coherent package: an accepted execution must never pair a new WORLD with incompatible Lua, in either direction.

## Validation changes

The contract becomes mode-aware rather than relaxed. For `lua-owned`, current semantics are preserved exactly. For `materialized-world`: Lua must bind to the required semantic entities, required interactions and objectives must be wired, and **Lua must not rebuild the canonical world** — a rule that is new work, not a deletion. The validator must know which mode it is validating; a gate must never be weakened to make a test pass.

## Artifact atomicity

WORLD, LUA_GENERATION and VALIDATION must be committed as one package.

**The existing staging mechanism is not sufficient, and saying otherwise would have been wrong.** What PIPELINE-1B introduced defers writing until validation passes; it does not make the writes atomic. `GenerationArtifactRecorder.record()` then calls `ArtifactStore.store()` once per staged artifact and once for `VALIDATION`, and each call persists immediately. A failure partway through that loop leaves an execution holding WORLD or Lua without the validation and mode information that says whether they belong together — the incoherent package this section exists to forbid.

WORLD-1C therefore needs a real commit boundary: a durable marker written last that makes a package readable, with unmarked packages ignored by delivery, or an equivalent transaction in the storage provider. That is additional work this record does not hand-wave, and it is a prerequisite for the ownership switch rather than a detail of it.

## Studio evidence ceiling

Structural contract evidence for plugin Lua is not runtime evidence. WORLD-1C cannot be recorded as done on structural tests, and switching canonical ownership on structural evidence alone is what this record exists to prevent.

## Implemented so far

**August 15, 2026 — the first vertical slice, and only that.** It makes runtime
world ownership *stated* and makes an artifact package *publishable as a unit*.
It does not move ownership, and no path in the repository produces
`materialized-world`.

### What landed

1. **Explicit `worldRuntimeMode`.** `lua-owned | materialized-world`, on the
   durable `GenerationExecution`, on the `WORLD_MODEL` artifact and on the
   `VALIDATION` report (`schemaVersion` 2). Resolution is one helper:
   **absence** means the historical `lua-owned` mode and is reported as
   `explicit: false`; an **unrecognised** value throws rather than degrading to
   `lua-owned`, so a record written by a newer or corrupted schema can never be
   read back as a historical one.
2. **A durable package commit boundary.** `ArtifactStore.commitPackage()` writes
   one marker to the `generation_package_commits` collection **after** every
   member artifact is durably acknowledged, naming each member by id, stage and
   content hash. It refuses a package missing `WORLD_MODEL` or `LUA_GENERATION`,
   refuses a stated mode that contradicts the world model, and refuses a
   generation package without a passing `VALIDATION`. This is the real commit
   boundary section [Artifact atomicity](#artifact-atomicity) says the staging
   mechanism is not.
3. **Delivery reads through the marker.** `getDeliverableArtifacts()` is what
   Studio sync now uses. A package whose artifacts declare **no** mode is
   returned exactly as before, marker or not — historical executions stay
   readable, re-deliverable and valid. Once **any** `WORLD_MODEL` or
   `VALIDATION` artifact declares a mode, the package is deliverable only
   through a marker whose every reference still resolves to the same id, stage,
   project and content hash. `StudioRuntime.queueProjectExport` additionally
   refuses to queue when the transfer did not carry the whole snapshot.
4. **Repair preserves the mode and does not widen it.** A repaired execution
   carries the parent's `WORLD_MODEL` forward unchanged, so the mode travels
   with it, and commits its own package. A `materialized-world` parent is
   deliberately **not** committed: repair still accepts regenerated Lua on
   `getPlayableLuaIssues`, which is the `lua-owned` contract and would accept
   world-building Lua beside a materialized world. Until that gate is
   mode-aware, such a repair persists its artifacts and delivery withholds them.

### What did not land, and is still required

- **August 19, 2026 — second vertical slice.** `getPlayableLuaIssues` and
  `crossValidateWorld` are now mode-aware. Both default to `lua-owned` when a
  caller passes no mode, so `LuaGeneratorAgent`'s four post-validation sites,
  `PipelineExecutor`, and `RepairExecutor`/`RepairEngine` — none of which were
  touched — keep evaluating exactly the `lua-owned` contract they always did.
  `GenerationArtifactRecorder` now threads its resolved `worldRuntimeMode`
  through both calls plus `normalizeLuaArtifactContent`'s internal
  `assertPlayableLuaScripts`, so a determination made under one mode cannot be
  re-checked against the other mode's rules inside the same recording.
  - The three rules in [The playability contract](#1-the-playability-contract)
    that assumed Lua builds the world now branch: the "world instances" rule
    is a binding rule under `materialized-world` (a `workspace` lookup call,
    not `Instance.new`) and additionally refuses a script that constructs a
    new instance directly under `Workspace`, which is Lua rebuilding the
    canonical world. The "one script owns everything" rule drops its world-
    creation clause under `materialized-world`; the interaction, `RemoteEvent`
    and fire-call clauses are unchanged. The gameplay-interaction rule and
    every HUD rule are byte-identical in both modes, per this doc's own table.
  - `crossValidateWorld` gained a `deterministic-binding-pattern` evidence
    class alongside `deterministic-pattern`, recorded on every result. Only
    the `player-entry` role's evidence changed (a `workspace` lookup paired
    with `:PivotTo`, chosen because it overlaps none of `lua-owned`'s
    evidence patterns); every other role reuses the exact `lua-owned`
    evidence object, for the reasons this doc already gives for the HUD and
    gameplay-interaction playability rules.
  - Both functions throw on a mode outside `lua-owned`/`materialized-world`
    rather than silently choosing an evidence class.
  - Tests: `server/src/__tests__/world1c.mode-aware-validation.test.ts`.
- Nothing sets `materialized-world`. The value exists in the type and is refused
  or withheld everywhere it could reach delivery. No producer was changed by
  this slice, and `RepairExecutor`'s acceptance gate still resolves to
  `lua-owned` because it never passes a mode.
- No mode-aware sweeping on delivery, so the rollback hazard in
  [Studio delivery and rollback](#7-studio-delivery-and-rollback) is unaddressed.
- `LuaGeneratorAgent`, its prompt and its `playableFallback` still build the
  world.
- **No runtime evidence.** Nothing in this slice was observed in a Roblox Studio
  session, and the [Studio evidence ceiling](#studio-evidence-ceiling) is
  unchanged.

### Behaviour change a consumer can observe

Editing the **content** of an artifact belonging to a committed package makes
that whole package undeliverable until the content hashes back to what the
marker named. Approval and comment change review state, not bytes, and do not
disturb the package. Before this slice an edited package still exported. This is
deliberate — a package is the set of bytes its validation report was computed
over — and `studio1.artifact-lineage.test.ts` was updated to assert the stronger
rule rather than the weaker one it previously encoded.

### The v2 concept pipeline

`PipelineEngine` / `PipelineExecutor` (the `concept` route) writes a `VALIDATION`
report that now declares a mode, and never calls `commitPackage`. Its pipeline
ids are not generation execution ids and nothing routes them to Studio delivery,
so no delivery path is affected today. It is recorded here as a known gap rather
than fixed, because giving that pipeline a package commit is outside this slice.

## Out of scope

Terrain, procedural biomes, mesh/decal/audio upload, place publishing, NPC AI, economy, progression, quests, monetization, LiveOps, `AGENT-CONTRACT-1`, conditional pipeline work, provider policy, and any fixed runtime world template. WORLD-1C must work for arbitrary semantic entity graphs; a spawn/collectible/objective skeleton would be a template wearing new words.

<!-- prettier-ignore-end -->
