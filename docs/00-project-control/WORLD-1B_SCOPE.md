<!-- prettier-ignore-start -->

# WORLD-1B — Design-Time World Materialization

**Status:** Code complete, contract tested, **not done**. Operator-observed Studio acceptance is outstanding and is deliberately not attempted in this delivery.
**Depends on:** `WORLD-1A` (semantic world model and cross-artifact validation), `STUDIO-2F-A` (UI materialization architecture this reuses).

## Objective

Materialize the typed `WORLD_MODEL` artifact into real Roblox Studio instances as a deterministic, **design-time, non-canonical** scene graph.

## Audit findings

These were established by reading the code before any of it was changed.

### 1. The WORLD artifact contract as WORLD-1A produced it

`buildWorldModel()` emits `{ schemaVersion, systems[], entities[], relationships[], constraints[], dependencies[], limits[] }`. Systems and entities carry `{ id, role, title, source }` and entities may carry `quantity`. Identifiers are derived, not random: `mechanic-1`, `service-spawnservice`, `condition-winCondition`, `presentation`. Roles are the closed set `player-entry`, `interactive-entity`, `progress-signal`, `presentation`, `persistence`, `server-authority`, `descriptive`.

**There is no geometry anywhere in the model**, by design — it says what the world is for, never where anything is.

### 2. Cross-artifact validation

`crossValidateWorld(model, scripts)` asks whether the generated Lua contains what each role requires and reports `supported` / `unsupported` / `unverifiable`. It reaches the `VALIDATION` report as one advisory check. WORLD-1B does not change any of it, and the semantic identifiers it keys on are the same identifiers the scene graph now carries as attributes.

### 3. Studio materialization architecture

`UITreeMaterializer.lua` establishes the pattern this slice reuses rather than reinvents:

- **Independent allowlists.** The plugin carries its own copy of class, property and enum allowlists because it is the side that calls `Instance.new`. A cross-language parity test asserts set equality.
- **`AIStudioManaged` ownership.** Only instances carrying that attribute are ever destroyed. A generated name colliding with a hand-built instance fails the export instead of deleting the creator's work, and creator-authored instances found at any depth inside a managed subtree are moved to `AIStudioPreserved` first.
- **ARTIFACT-1 stable identity.** Instance identity comes from the stage-derived artifact name, never from `artifact.id`, which `ArtifactStore` mints with `randomUUID` on every store.
- **Atomic detached build.** The whole tree is validated (creating nothing), then built with no parent, then attached. A validation or build failure leaves the DataModel untouched.
- **Replacement semantics.** Delivered roots replace their managed predecessors; managed roots no longer delivered are swept.
- **Receipt verification.** The plugin reports `{ screenName, instancePath }` pairs; the backend derives the expected set from the artifact **as it was transferred by that command**, and rejects missing, extra, duplicate, malformed and path-mismatched receipts.

### 4. What would be duplicated if a materialized WORLD tree became live

`playableLua.ts:158` requires the generated server `Script` to call `Instance.new` and reference `workspace`; a package that does not is rejected as unplayable. **The live world is therefore built imperatively into `Workspace` at run time, by contract.** Any materialized scene graph placed in `Workspace` would stand beside a second world the server script builds on Play — the creator would see doubled geometry, and the platform would own two conflicting definitions of the same world.

### 5. Ownership boundary

| Concern | Owner | Where |
|---|---|---|
| The live, playable world | Generated server `Script` (unchanged) | `Workspace`, at run time |
| The design-time semantic scene | WORLD-1B materialization | `ReplicatedStorage.AIStudioArtifacts.WORLD_MODEL`, at design time |

`ReplicatedStorage.AIStudioArtifacts` is the hierarchy STUDIO-2F-A already chose for exactly this reason, and nothing in generated Lua reads it. The two never contend, because they are never in the same container.

## Binding decision

**WORLD-1B is design-time materialization only. The Lua-generated runtime world remains canonical.** The scene graph is a semantic map a creator can inspect, not a world a player can enter. Making it canonical is `WORLD-1C` and is not begun here.

## The contract

Semantic rather than template-shaped, so it does not encode one genre:

- **Entities** carry a stable `entityId` and a **semantic role**, both taken from the WORLD-1A model.
- **Zones** group entities by role, giving parent/child containment without prescribing what a zone contains.
- **Transforms** are deterministic: position derives from zone and entity ordinal, so the same model always produces the same scene.
- **Relationships and dependencies** travel as attributes referencing other entity identifiers.
- **Interaction roles** are the model's roles, not a fixed list of gameplay nouns.

There is no spawn/collectible/objective/shop vocabulary anywhere in the contract. A racing grid, a tycoon plot and a horror map differ only in which roles their claims carry.

### Safety limits

- Classes are a closed allowlist of `Folder`, `Model` and `Part`. **No script class, and no `Source` property, can be expressed at all.**
- Properties and attribute names are allowlisted per class, values are typed and range-checked.
- Depth, node count, name shape and payload size are bounded on both sides.
- Attributes carrying semantic identity are namespaced `AIStudioWorld*`.

## Evidence ceiling

There is still no Lua execution harness in this repository. This delivery is therefore:

- **code complete** — the backend and plugin contracts are implemented;
- **contract tested** — including cross-language allowlist parity and mutation-verified safety properties;
- **not operator-observed** — no Studio session has run it.

`WORLD-1B` must not be recorded as done until an operator-observed session confirms it. That session should ideally also close the outstanding `ARTIFACT-1` and `STUDIO-2F-A` evidence, which remains pending and is **not** addressed by this delivery.

## Operator acceptance checklist (for the later session)

1. Export a project and confirm `ReplicatedStorage.AIStudioArtifacts.WORLD_MODEL` contains zone folders with one model per entity, each carrying `AIStudioWorldEntityId` and `AIStudioWorldRole`.
2. Confirm `Workspace` is untouched by the export, and that Play still builds exactly one world, from the generated server script.
3. Export a second time and confirm the zone contents are replaced, not duplicated.
4. Regenerate with a changed design so one entity disappears, and confirm its managed model is swept.
5. Hand-add an instance inside a generated zone, re-export, and confirm it survives in `AIStudioPreserved` rather than being destroyed.
6. Rename a hand-built instance to collide with a generated entity name and confirm the export fails without deleting it.

## Out of scope

`WORLD-1C` canonical ownership, live `Workspace` migration, binding Lua generation to materialized entities, WORLD repair, terrain or procedural biomes, native mesh/decal/audio upload, place publishing, and any change to `playableLua` validation.

<!-- prettier-ignore-end -->
