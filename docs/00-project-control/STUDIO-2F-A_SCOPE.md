<!-- prettier-ignore-start -->

# STUDIO-2F-A Scope — Generated GUI Materialization

**Status:** Scoped, not started
**Parent delivery:** `STUDIO-2F` — native assets, GUI, runtime, and place delivery
**Authority:** this document defines the sprint. [ROADMAP_STATUS.md](./ROADMAP_STATUS.md) remains the ordered delivery authority; where the two disagree, the roadmap wins.

`STUDIO-2F` was carried for months as a single roadmap row reading "Native assets, GUI, runtime, and place delivery | Medium | Deferred | control gates". Two findings forced a decomposition before any work could start.

First, **no unsatisfied gate blocks it.** The phrase "control gates" was genericized on August 8, 2026 precisely because the last named blocker — artifact-applying repair evidence — had completed. Every gate the historical TECH-AUDIT-2 planning documents name as a precondition (`HARDEN-2A`, `ARCH-2B`, `FRONTEND-2C`, `RUNTIME-2D`, `DURABILITY-2E`, `SECURITY-2G`, `DOC-202`) is complete. `STUDIO-2F` was blocked by not being scoped, not by an outstanding control.

Second, **it cannot ship as one sprint.** [ROADMAP_RULES.md](../governance/ROADMAP_RULES.md) requires that each sprint has exactly one objective. The only pre-existing breakdown is a five-bullet sketch in the explicitly non-authoritative [ROADMAP_v2_UPDATE.md](../02-audits/technical-v2/ROADMAP_v2_UPDATE.md). `STUDIO-2F` is therefore split into `STUDIO-2F-A` through `STUDIO-2F-E`; this document scopes `STUDIO-2F-A` only.

## Required roadmap questions

| Question | Answer |
| --- | --- |
| Business objective | Generated user interfaces reach Roblox Studio as real, inspectable, editable Instance trees instead of inert JSON text, so a creator can see and edit the generated UI as Roblox objects. |
| Architecture impact | None to the layer graph. New code lives in `server/src/ui-gen` (a `domains` module) and is consumed by `server/src/studio` (also `domains`). Same-layer edges are not violations, so `architecture.manifest.json`, `architecture.layer-debt.json` and `allowedLayerEdges` are all untouched. |
| Existing modules affected | `server/src/ui-gen`, `server/src/studio/artifacts/GenerationArtifactRecorder.ts`, `server/src/studio/v2/StudioRuntime.ts`, `server/src/studio/v2/StudioTypes.ts`, `server/src/routes/studio.ts`, `studio-plugin/src/utils/ArtifactLoader.lua`, `studio-plugin/src/services/SyncManager.lua`, `studio-plugin/src/core/Config.lua`. |
| Dependencies | `STUDIO-1`, `STUDIO-ACCEPT-1`, `STUDIO-SYNC-1A`, `DOC-202A` — all complete. No new external service, credential, or infrastructure. |
| Complexity | L |
| Estimated effort | 2–3 working sessions: contract and builder, plugin materialization, receipt verification, then operator-observed acceptance. |
| Risks | A backend-supplied class name reaching `Instance.new` is arbitrary code injection; non-deterministic artifact content breaks delivery idempotence; the plugin has no automated test harness. Each is addressed below. |
| Testing strategy | See [Testing Strategy](#testing-strategy). Automated coverage is backend-only by necessity; plugin behavior is operator-observed and labelled as such. |
| Rollback strategy | See [Rollback Strategy](#rollback-strategy). The plugin change is additive and falls back to current behavior. |

## Current behavior this replaces

`studio-plugin/src/utils/ArtifactLoader.lua` creates exactly three kinds of instance: `Script`/`LocalScript`/`ModuleScript` chosen by filename suffix, `Folder` for intermediate path segments, and `StringValue` for every non-Lua artifact. A `ScreenGui` is never created.

The `UI_GENERATION` stage already produces a `ui-layout` artifact (`uiLayout.json`), it is already recorded by `GenerationArtifactRecorder`, and it already rides along in every export payload. It simply materializes as an inert JSON string under `ReplicatedStorage/AIStudioArtifacts/UI_GENERATION/<artifactId>`. The delivery mechanism is not missing — only the materialization is.

Separately, `server/src/ui-gen/` already contains a real instance-tree builder (`UIHierarchyBuilder`, `UILayoutBuilder`, `UIStyleBuilder`, `UIValidationService`) that produces `ScreenGui`/`Frame`/`TextLabel`/`TextButton`/`UIListLayout`/`UIPadding` trees with property maps. It is not on the `PlanExecutor` path and its only consumer is `PlatformIntegrationManager`. This sprint reuses that vocabulary rather than inventing a second one.

## Binding decision: where the materialized tree is parented

Roblox clones `StarterGui` children into each player's `PlayerGui` at spawn. The generated client `LocalScript` already builds a HUD imperatively at runtime, so parenting a delivered `ScreenGui` into `StarterGui` would produce **two HUDs** in the same session.

**Decision: the imperative Lua HUD remains runtime-canonical. `assertPlayableLuaScripts` is not modified. The materialized tree is parented under `ReplicatedStorage/AIStudioArtifacts/UI_GENERATION/`, never `StarterGui`.**

This is not a consolation outcome. A `ScreenGui` under `ReplicatedStorage` is a fully real, selectable, editable Instance tree that a creator can inspect in Explorer and drag into `StarterGui`. It is inert at Play time only because of where Roblox clones from.

The alternative — relaxing the playability gate so the client script may bind to a delivered `ScreenGui` instead of creating one — was rejected for two concrete reasons, both verified in code rather than assumed:

1. **It would break what REPAIR-1A proves.** `server/src/repair/RepairExecutor.ts` accepts a repair only when `getPlayableLuaIssues(scripts)` is empty, and it reads *only* the Lua artifact. Relaxing the rule to "creates a ScreenGui **or** binds to a delivered one" converts a single-artifact invariant into a cross-artifact one that the repair path structurally cannot evaluate. Repair would begin accepting client scripts that wait forever on a screen that was never delivered or was renamed.
2. **Delivery is not atomic.** `SyncManager:_processExport` materializes artifacts in a loop and, on failure, reports the command failed *without rolling back instances already created*. Under a relaxed gate, a partial export could leave scripts present and GUI absent — a HUD-less game that passed every backend gate. That state is impossible today by construction, and this sprint must not introduce it.

Flipping the canonical HUD to the delivered tree remains legitimate future work, but it must be a single atomic change — relax the validator, change the generator to bind rather than create, add a cross-artifact check to the repair input assembler, and reparent to `StarterGui`. That is `STUDIO-2F-E`, not this sprint.

The materialized root carries an attribute `AIStudioDeliveryMode = "design-time"` so the placement reads as intentional rather than as a defect.

## Scope

- **Wire contract** — a new `server/src/ui-gen/UIInstanceTreeContract.ts` defining the materializable tree: a closed `ALLOWED_UI_CLASSES` set, a per-class property allowlist, a `schemaVersion`, typed property values, and a fail-closed `assertMaterializableUITree()` modelled on the existing `assertPlayableLuaScripts`.
- **Typed property values.** Property values carry an explicit kind (`bool`, `int`, `number`, `string`, `udim2`, `udim`, `vector2`, `color3`, `enum`) so Lua can construct them unambiguously. A raw four-number array cannot be distinguished from a `Rect` or a plain table; a bare string cannot be distinguished from an Enum item name. `color3` is carried as 0–255 integers rather than 0–1 floats so the JSON round-trips exactly and no float drift feeds the artifact hash.
- **Deterministic translation** — a new `server/src/ui-gen/UIInstanceTreeBuilder.ts` converting `UIGeneratorAgent`'s abstract `uiDesign` into the wire tree, reusing the `UIHierarchyBuilder`/`UIStyleBuilder` property vocabulary. The language model continues to produce *intent* (screen names, element types, labels, theme colors); geometry, `ZIndex` and `LayoutOrder` are derived deterministically in code.
- **Pipeline hook** — extend the existing stage ternary in `server/src/studio/artifacts/GenerationArtifactRecorder.ts` with a `UI_GENERATION` branch alongside the current `LUA_GENERATION` one, failing closed on malformed input exactly as the Lua branch does. The artifact keeps `ArtifactType: "ui-layout"` and gains a content-level `schemaVersion`; the type is derived per stage for every pipeline, so it cannot discriminate rows already persisted with the older abstract content, whereas an absent content field can.
- **Plugin materialization** — a new `ui-layout` branch in `ArtifactLoader.lua` that builds the tree behind its own class and property allowlists, calling `error()` on any unknown class, property, value kind or enum item. No silent skipping.
- **Materialization must be atomic.** The plugin validates the **entire** incoming tree — every class, property name, value kind and enum item, plus the depth and object-count caps — **before creating a single instance**, and only then builds. If a build-phase failure still occurs, every instance created during that attempt is destroyed before the error propagates. This is not optional polish: `SyncManager:_processExport` does not roll back on failure, so a mid-tree `error()` without this rule leaves a partially built `ScreenGui` in the place. That is the same class of half-applied state used above to argue against relaxing the playability gate, and this sprint must not reintroduce it in its own delivery path.
- **Replacement semantics** — screens are keyed by screen name under `ReplicatedStorage/AIStudioArtifacts/UI_GENERATION/`. Both the replacement and the sweep are restricted to instances carrying `AIStudioManaged = true`, so hand-added children survive in every case.
- **Name collisions with unowned instances fail closed.** If a child of the stage folder matches an incoming screen name but does **not** carry `AIStudioManaged`, the plugin must not destroy it and must not create a same-named sibling. It errors, and the export is reported failed. Silently deleting a creator's hand-built `ScreenGui` because it happened to share a generated name is unacceptable, and a duplicate sibling would make the delivered path ambiguous to the very verification below.
- **Receipt verification** — make `instancePath` required and verified against a backend-computed expected path in `StudioRuntime.verifyImportEvidence`. For UI artifacts the receipt carries an **identity-bearing** structure — a list of `{ screenName, instancePath }` pairs, not a bare path array — because a positional array cannot prove *which* screen landed where. Verification rejects duplicate, missing, extra, or path-mismatched entries against the screen set the backend already knows from the artifact content.

### Backend and plugin version matrix

The backend and the plugin ship separately, so all four combinations occur in the field and each must have defined behavior. The scope requires this matrix to be implemented and tested, not assumed.

| Backend | Plugin | Required behavior |
| --- | --- | --- |
| Old (no `schemaVersion`) | Old | Unchanged: the artifact materializes as a `StringValue`. |
| Old (no `schemaVersion`) | New | Falls through to the `StringValue` path. This is the **positive legacy-fallback case** and needs its own test, because the scope otherwise leaves it to operator observation. |
| New (`schemaVersion: 1`) | Old | The plugin does not recognize the branch and materializes a `StringValue`. Delivery still succeeds; the tree simply is not built. |
| New (`schemaVersion: 1`) | New | The tree is materialized. |

Absence of `schemaVersion` is the only fallback trigger. Content that **claims** `schemaVersion: 1` but is malformed must **fail**, never silently degrade to `StringValue` — otherwise a broken payload would produce a receipt that `verifyImportEvidence` accepts, and the export would be recorded as verified while the tree was never built. A future `schemaVersion` the plugin does not know must also fail rather than fall back, for the same reason.

### Two traps this sprint must design against

Both were verified directly in the code and are the reason several of the choices above are not negotiable.

**Non-deterministic content breaks idempotence.** `server/src/ui-gen/types.ts` mints every `UIObject` id with `randomUUID()`, and `ArtifactStore.store` mints artifact ids the same way. The export snapshot signature is built from `artifactId:hash` pairs, so it suppresses only re-export of the *same* execution; any regeneration produces new ids and re-delivers even for byte-identical content. Consequently the wire tree must carry no UUIDs at all — parenting is expressed by nesting, not by id references — and materialized screens must be keyed by **screen name**, not artifact id. Keying by artifact id would orphan a duplicate `ScreenGui` on every regeneration.

**An unrestricted class name is code injection.** Passing a backend-supplied string to `Instance.new` would let a payload of `{"className": "Script", "properties": {"Source": "..."}}` create an executable script inside what the system calls a GUI tree, bypassing the filename-suffix contract that is currently the only thing deciding what becomes a `Script`. The plugin-side allowlist is a security control, not a tidiness measure, and it must exist independently of the backend validator rather than trusting it.

## Out of Scope

- Native asset materialization — meshes, decals, audio, asset ids (`STUDIO-2F-B`).
- Place and `.rbxl` delivery, or any `DataModel`-level export (`STUDIO-2F-C`).
- Packaging the runtime validator into the canonical plugin (`STUDIO-2F-D`). Note that the current plugin contract and package tests *assert its absence*, so that sprint must flip those assertions deliberately.
- Flipping the canonical HUD from imperative Lua to the delivered tree, and the validator relaxation it requires (`STUDIO-2F-E`).
- Independent content verification — having the plugin re-serialize and re-hash what it materialized. Today the plugin echoes back the hash the backend sent, so verification proves delivery and count integrity, not that Studio independently recomputed the content. Fixing that changes the receipt contract for every artifact type and is its own delivery.
- Content-addressed artifact ids in `ArtifactStore`, which would make the snapshot signature genuinely content-based.
- Language-model-authored geometry, responsive or mobile layout, animation, and any UI class beyond the allowlist.
- A Frontend preview of the materialized tree, and bidirectional Studio-to-backend GUI editing.

## Testing Strategy

Automated coverage is backend-only, and this document states that limit rather than implying the plugin is tested.

- **Determinism regression** — the same `uiDesign` must produce byte-identical serialized content across repeated builds and separate process runs. This is the direct guard against the `randomUUID` trap.
- **Fail-closed table** — unknown class, unknown property, unknown value kind, unknown enum item, duplicate sibling name, illegal name characters, excessive depth, excessive object count, and a non-`ScreenGui` root must each be rejected.
- **Cross-language allowlist parity** — a test that reads the allowlist tables out of `ArtifactLoader.lua` as text and asserts set equality with the TypeScript constants. Nothing else prevents the two lists from drifting apart, and drift means either silent rejection in Studio or an unguarded class reaching `Instance.new`.
- **Recorder branch** — `UI_GENERATION` output carries the schema version and screens; malformed input throws.
- **Verification** — missing `instancePath`, a wrong path, and a duplicate, missing, extra or path-mismatched `{ screenName, instancePath }` entry must each be rejected; a correct receipt must verify.
- **Legacy fallback, positively tested** — content without `schemaVersion` must take the `StringValue` path and still produce a valid receipt. This is the one version-matrix cell that would otherwise rest entirely on operator observation.
- **Malformed new content must fail, not degrade** — content claiming `schemaVersion: 1` that is invalid, and content claiming an unknown future version, must both be rejected rather than falling back to `StringValue`, so a broken payload can never be recorded as verified.
- **Mechanical gates** — plugin repackage with a version bump, full `npm run build` (architecture, boundary, layer-debt, runtime-ownership, memory-ownership, durable-writes and operational-state validators, then `tsc`), lint, format check, and the test suite.

**Ceiling, stated plainly:** `studio-plugin/` contains only Lua sources and a README. There is no Lua test harness, and the existing "plugin tests" are substring assertions over Lua source text — they prove a string is present, not that the code behaves. Real materialization evidence must therefore be operator-observed in Roblox Studio and recorded as such, following the precedent set by [RUNTIME-PLAYTEST-1_RESULT.md](./RUNTIME-PLAYTEST-1_RESULT.md), which labels its own evidence operator-observed rather than machine-verified. The acceptance record must capture the materialized tree in Explorer, a second export showing no duplicate or orphaned screens, a deliberately corrupted class name placed **after** a valid screen — showing the export reported failure *and* left no partially built tree behind — a hand-added unowned `ScreenGui` sharing a generated screen name showing the export failed rather than destroying it, and a Play test showing exactly one HUD.

## Rollback Strategy

The plugin branch is additive: any artifact **without** a `schemaVersion` falls through to the existing `StringValue` path, so a plugin carrying the new branch behaves identically to the current one when talking to a backend that does not emit the new content. This is a fallback for *absent* content only — malformed or future-versioned content fails rather than degrading, per the version matrix above, so rollback safety is never bought at the cost of recording an unbuilt tree as verified.

Reverting the backend commit alone restores prior behavior with no plugin redeploy and no Studio-side action. Reverting the plugin alone is also safe: delivered trees stop materializing and become JSON strings again.

Because replacement is destructive and keyed by screen name, a rollback leaves previously materialized `ScreenGui` instances in place under `ReplicatedStorage/AIStudioArtifacts/UI_GENERATION/`. They carry the `AIStudioManaged` attribute and can be deleted manually; nothing depends on them at runtime, which is a direct consequence of the parenting decision above.

## Subsequent STUDIO-2F sub-phases

Listed for ordering context. Only `STUDIO-2F-A` is scoped; the others are named so that work discovered during this sprint has a documented home rather than being absorbed.

| ID | Objective | Notes |
| --- | --- | --- |
| `STUDIO-2F-B` | Native asset materialization — meshes, decals, audio | Requires Roblox Open Cloud. **No Roblox credential surface exists today**: there is no API key, universe id or creator id in the environment configuration, so this sprint begins with secret management and must respect the rule that the distributed plugin never carries credentials. |
| `STUDIO-2F-C` | Place and `.rbxl` delivery | Begins with a documented decision between Open Cloud place publication, Rojo-based `.rbxl` generation, and remaining insert-into-open-place. Delivery is currently strictly insert-into-open-place. |
| `STUDIO-2F-D` | Runtime validator in the canonical plugin package | Current contract and package tests assert its absence; those assertions must be flipped deliberately. |
| `STUDIO-2F-E` | Canonical-HUD flip | The atomic change described above. Must not be split, because a partial application leaves the playability gate proving less than it claims. |

<!-- prettier-ignore-end -->
