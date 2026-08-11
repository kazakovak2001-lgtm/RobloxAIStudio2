<!-- prettier-ignore-start -->

# ASSET-FABRIC-1 — unified multimodal asset contract

**Status:** ✅ Complete — backend PR #227, **to the contract only**. Backend-only; no Roblox Studio evidence is required or claimed.
**Depends on:** `ARTIFACT-CONTRACT-2` (durable envelope, content identity, lineage). Complete.
**Complexity:** M. **Risk:** Low — the check is advisory and no delivery behaviour changes.

Stage six of the [ROADMAP-EXTENSION-1](./ROADMAP-EXTENSION-1_STRATEGIC_DIRECTION.md) sequencing, taken because it is the one `High` item that can move while Studio acceptance stays paused: it needs no operator session and no Open Cloud credential surface.

## Audit findings

Read from the implementations at `bc67e7c0e62cec6fdcade8073a16fe27b7bd950c`, not assumed.

### The asset plan already ships on every generation, unchecked

`asset_planner` is a pipeline-reachable agent. `pipelineDefinition.ts` declares it with `deps: ["game_designer"]`, `GenerationArtifactRecorder` maps it to the `ASSET_PLANNING` stage, and `ArtifactStore` records it as `assetPlan.json` with artifact type `asset-plan`. `SyncValidator` accepts that type, so it travels to Roblox Studio like every other non-Lua artifact and lands as inert JSON.

**Nothing validates it.** A search across `validation/` and `studio/` returns the agent-to-stage mapping and the sync type allowlist — no schema, no decoder, no check, no cross-artifact comparison. The recorder takes the generic path and stores `node.output` exactly as the agent produced it.

**It carries no lineage.** `ARTIFACT_DEPENDENCY_RULES` has no `ASSET_PLANNING` entry, so the stage may declare no dependency at all and the plan asserts no derivation from the design it exists to serve.

This is the asymmetry that makes the slice worth taking now: `STUDIO-2F-A` gave UI a typed materializable tree with a version check, and `WORLD-1A` gave the world a typed model with cross-artifact validation. Assets got neither, while shipping on every run.

### What the agent actually emits

Both the model path and the deterministic fallback produce one shape:

```
assetPlan: {
  models:     [{ id, name, description, complexity: simple|medium|complex, source: builtin|marketplace|custom }]
  textures:   [{ id, name, resolution }]
  sounds:     [{ id, name, type: sfx|music|ambient }]
  animations: [{ id, name, target, frames }]
}
```

Four findings follow, and each is a contract-quality requirement rather than a style preference:

1. **Animations reference models by display name.** `target: "PlayerCharacter"` names the `name` field of `model_player`, not its id. Identity therefore depends on a human-readable label that nothing holds stable, which is exactly what a reference must not do.
2. **Ids exist and nothing enforces them.** No uniqueness check, so two entries may share an id and the later silently wins for any consumer that indexes by it.
3. **Asset kind is positional.** An entry is a texture because of the array it sits in. Nothing on the entry says so, and a flattened list would lose the kind entirely.
4. **Nothing represents whether an asset is required**, and only models carry any description, so purpose is unrepresentable for three of the four kinds.

`source: "marketplace"` is also asserted with nothing behind it — no search, no resolution, no upload. That is `ASSET-FABRIC-2`'s territory and stays out of scope; the contract records the claim as a claim.

### Fallback content is a real case, not a test case

`AssetPlannerAgent` returns a complete hardcoded plan when no provider is wired, and the definition permits fallback. So a validator must treat a well-formed plan produced without a model as valid — provenance is `PROVIDER-1B`'s field, not this contract's — while `_usedFallback` continues to travel on the output untouched.

## The contract

`ASSET_PLAN_SCHEMA_VERSION = 1`. A decoder, not a cast: every field is checked against the closed sets below, and a stored artifact is decoded rather than trusted.

| Field | Meaning |
|---|---|
| `kind` | `model` \| `texture` \| `sound` \| `animation`. **Explicit on every entry**, never inferred from the array it sits in or from its name |
| `id` | Stable identity. Unique across the whole plan, not per kind, because a reference names one asset |
| `name` | Human-readable label. **Never used for identity** |
| `purpose` | What the asset is for, representable for every kind rather than models only |
| `required` | Whether the game is incomplete without it |
| `references` | Ids of other planned assets this one depends on — an animation names its model by **id** |
| `attributes` | Kind-specific detail, decoded per kind against closed sets where the emitted data has them |

Unknown fields follow the repository's existing schema-version policy, the one `UIInstanceTreeContract` sets: a payload whose `schemaVersion` does not match is refused outright rather than partially read, and fields absent from version 1 are not silently accepted into it.

## Scope

1. A versioned `AssetPlan` type covering models, textures, sounds and animations, with explicit kind, stable ids, purpose, required-ness and id-based references.
2. A deterministic decoder validating agent output **before** durable persistence, reporting the offending entry and field path on every failure, with duplicate ids a failure.
3. Three distinguishable states: a valid plan, an unreadable or invalid plan, and no plan attempted. Absence and invalidity are never reported as a complete plan.
4. `ASSET_PLANNING: ["GAME_DESIGN"]` added to `ARTIFACT_DEPENDENCY_RULES`, enforced through the existing artifact contract rather than as a special case, matching what the pipeline definition already declares.
5. An advisory `assets-planned` check in the generation validation report, alongside `ui-materializable` and `world-claims-supported`.
6. Legacy compatibility: an untyped stored payload decodes to the not-typed state and is never rewritten or assigned a version it never had.

### What review changed

Seven findings, all valid, and one of them meant the contract was unreachable in production.

**The registered prompt asked for a different shape.** `defaultPrompts.ts` requested `models: {name, description}` with no ids at all, and `BaseAgent.buildPrompt` prefers the registered prompt over the agent's inline one. So with a provider configured, every plan would have been `invalid` and only the no-LLM fallback could ever have satisfied the contract — and my tests used the fallback shape, so nothing caught it. Both the registered prompt and the legacy template now request the contract's shape.

**Repair broke.** `persistRepairedExecution` copies artifacts with no dependencies, so the required rule threw and a successful repair of a normal generation failed before the repaired Lua was persisted. The plan is now rebound to the design carried into the same execution, and the carry loop copies design-first rather than trusting the parent's storage order.

**The repair playtest stopped seeing assets.** `RepairInputAssembler.parseAssetPlan` read only the legacy `content.assetPlan` wrapper, so a typed plan reported zero assets and changed repair scoring. It now decodes the typed plan and keeps legacy support.

**The decoder cast where it claimed to decode.** `attributes` was accepted as any object and asserted to `Record<string, string | number>`, so a stored `{ frames: false }` produced a `PlannedAsset` contradicting its own type. Values are now decoded against the same closed sets on the way back out, unrecognised keys are refused, and references are trimmed the way ids are.

**Staging depended on node order.** Lineage resolves only from committed stages, and `pending` followed whatever order the plan executor returned. A run listing the asset stage first would have thrown and lost a generation that had already passed validation. Staged artifacts are now ordered by the canonical stage sequence.

## Known limitations

Carried forward explicitly, because each is a thing the contract can express and the platform does not yet state:

- **`purpose` is populated for models only; `required` is unpopulated everywhere.** `purpose` is populated for model entries from the producer's `description` and is absent for textures, sounds and animations, whose current producer shape exposes no equivalent field. `required` is representable and unpopulated for every kind, because nothing the producer emits signals required-ness at all. Both fields exist so a producer can state them; only the model description does today.
- **`source: "marketplace"` is a claim with nothing behind it.** No search, no resolution, no upload. The contract records the claim as a claim.
- **Rigs and VFX are not covered**, because nothing produces them. The roadmap entry names them for `ASSET-FABRIC-2`.
- **Cross-artifact checks are limited to references within the plan.** Whether a planned asset corresponds to something the game design named is not checkable, because the design contract exposes no asset vocabulary, and inventing that check would assert a comparison nothing can make.
- **Nothing resolves, uploads or materializes an asset.** The plan stays a plan.

## Out of scope

Open Cloud credentials, Roblox asset upload, materialization, 3D or image or audio generation, marketplace search, licensing policy beyond existing security requirements, `ASSET-FABRIC-2`, Frontend UI, Studio acceptance work, and any change to a paused Studio status. `PIPELINE-1C` and `REMOTE-OPS-1` are not started.

Cross-artifact checks stay within what the current contracts can establish: references are checked **within** the plan, because ids are the plan's own. Whether a planned asset matches something the game design named is not checkable — the design contract exposes no asset vocabulary — and inventing that check would assert a comparison nothing can make.

## Testing strategy

A valid plan across all four kinds; a malformed top-level contract; a malformed individual entry; duplicate ids; missing required fields; an unsupported schema version; an absent plan; a legacy untyped stored artifact; lineage present and correct; missing required lineage; wrong upstream lineage; deterministic validation ordering; decode after a restart; and Studio transfer of a valid plan that claims no materialization. Each verified by mutation.

### Prerequisite for ASSET-FABRIC-2

Yes. `ASSET-FABRIC-2` now has a typed, versioned plan with stable ids to resolve and upload against, rather than an untyped payload whose references are display names. It stays blocked on the same missing Open Cloud credential surface that blocks `STUDIO-2F-B`; nothing here changes that.

## Rollback strategy

Additive. One new module, one new dependency rule, one advisory check. The agent's output shape is unchanged, so reverting leaves durable artifacts readable exactly as before.

<!-- prettier-ignore-end -->
