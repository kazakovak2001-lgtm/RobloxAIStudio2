<!-- prettier-ignore-start -->

# WORLD-1C — Canonical Runtime World Ownership

**Status:** Scoped and **blocked**. Implementation is not started, and must not start until the prerequisite below is satisfied.
**Depends on:** `WORLD-1A`, `WORLD-1B` (both merged), and — as a hard prerequisite — **operator-observed Studio acceptance of `WORLD-1B`**.

## Objective

Move ownership of the runtime world from the imperative Lua that builds it into `Workspace` today, to the typed WORLD scene, so that Lua binds to semantic entities and owns only gameplay behaviour.

## The blocker, stated first

**WORLD-1C must not be implemented until `WORLD-1B` has been observed working in a real Roblox Studio session.**

This is not caution about a new feature. It is what the audit found:

1. **The materializer has never run.** `WorldSceneMaterializer.lua` is contract-tested only. There is no Lua execution harness in this repository, so nothing has ever observed it create an instance, set an attribute, or return a path. Its own tests label that plainly.
2. **Today the Lua world is the safety net.** If the materializer silently fails, nothing is lost, because the generated server `Script` still builds the world. WORLD-1C removes that net: the world a player sees would come *only* from code no one has ever seen run.
3. **The switch invalidates the platform's sole runtime evidence.** `RUNTIME-PLAYTEST-1` is an operator-observed Play-mode result over a **Lua-created** world — a `GeneratedAdventure` Workspace folder with a spawn pad and five orbs. Under materialized-world ownership that evidence describes a world the platform no longer builds that way, and there is no replacement evidence.
4. **The same change would weaken the only gate that has held.** `getPlayableLuaIssues` is the fail-closed contract on every path into Studio — generation, the recorder, the v2 pipeline and repair acceptance. WORLD-1C necessarily replaces its world-creation rules with binding rules. Relaxing the one proven gate in the same change that introduces an unproven world source concentrates two risks in one step.

Shipping it now would mean: an unobserved materializer becomes the only world source, the proven gate is relaxed to allow it, the fallback that guarantees a playable game stops building a world, and the only runtime evidence the platform holds no longer describes what it does. **That is precisely the evidence standard this project refuses to break.**

### Prerequisite

One operator-observed Studio session confirming `WORLD-1B`: the scene appears under `ReplicatedStorage.AIStudioArtifacts.WORLD_MODEL` with the expected zones, entity models, and `AIStudioWorldEntityId` / `AIStudioWorldRole` attributes; re-export replaces rather than duplicates; a hand-added instance survives; and a name collision fails the export without destroying creator work. The six-point checklist is in [WORLD-1B_SCOPE.md](./WORLD-1B_SCOPE.md).

That session should also close the outstanding `ARTIFACT-1` and `STUDIO-2F-A` evidence, since all three deliveries touch the same plugin.

## Audit findings

### 1. The playability contract

Fifteen rules. Five are world-ownership rules and all five assume Lua builds the world:

| Rule | Assumes |
|---|---|
| `server code must create playable world instances` | `Instance.new` **and** `workspace` in server source |
| `server code must implement a gameplay interaction` | a `Touched`/`Activated`/`Triggered`/`MouseClick`/`OnServerEvent` connection |
| `one server Script must own the complete world, objective, and progress event` | **one** script containing world creation, an interaction, a `RemoteEvent` and a fire call |
| `client code must create a visible ScreenGui` / `must attach the HUD to PlayerGui` | client builds its own HUD |
| `server and client code must connect objective progress to the HUD` | remote or `leaderstats` path |

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

WORLD, LUA_GENERATION and VALIDATION must be committed as one package. The staging mechanism PIPELINE-1B introduced already does this — the recorder stages content and commits only after validation passes — so WORLD-1C should extend it rather than invent a second transaction model.

## Studio evidence ceiling

Structural contract evidence for plugin Lua is not runtime evidence. WORLD-1C cannot be recorded as done on structural tests, and switching canonical ownership on structural evidence alone is what this record exists to prevent.

## Out of scope

Terrain, procedural biomes, mesh/decal/audio upload, place publishing, NPC AI, economy, progression, quests, monetization, LiveOps, `AGENT-CONTRACT-1`, conditional pipeline work, provider policy, and any fixed runtime world template. WORLD-1C must work for arbitrary semantic entity graphs; a spawn/collectible/objective skeleton would be a template wearing new words.

<!-- prettier-ignore-end -->
