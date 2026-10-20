# STUDIO-ACCEPTANCE-PREP-1 — First Real Runtime Acceptance Runbook

**Status:** Preparation only. No live Roblox Studio session was run to produce
this document. **This document does not claim Studio runtime acceptance.**

**Tracking issue:** #257
**Base:** `fix/world1c-mode-aware-validation` @ `a75fd27ecff2ca3e12e55df004bac2d12c38623b`
**Boundary:** Studio/acceptance tooling only. No backend product code and no
frontend code changed to produce this document.

## Purpose

Make the first manual Roblox Studio runtime acceptance for issue #257
reproducible: one canonical fixture, exact operator steps, an evidence schema,
and a PASS/FAIL checklist, so the run can start immediately after this branch
merges — without re-deriving any of it live.

## What already exists (inspected, unmodified)

| Tooling                             | Location                                                                                                                                                                                                                      | What it proves                                                                                                                                                                                                            | What it does **not** prove                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin packaging                    | `npm run studio:package` ([scripts/package-studio-plugin.ts](../../scripts/package-studio-plugin.ts))                                                                                                                         | Deterministic `.rbxmx` + manifest + SHA-256 of the canonical plugin source                                                                                                                                                | Nothing runtime                                                                                                                                                       |
| Engine/plugin structural smoke      | `npm run studio:acceptance` ([scripts/studio-acceptance/run-studio-acceptance.ts](../../scripts/studio-acceptance/run-studio-acceptance.ts))                                                                                  | The exact `ArtifactLoader.lua` / `UITreeMaterializer.lua` / `WorldSceneMaterializer.lua` sources execute inside a real headless Studio `RunScript` process against deterministic fixtures                                 | No live backend, no `EXPORT_PROJECT` lifecycle, no gameplay, no Play/Play Solo                                                                                        |
| Headless generation-to-import smoke | [scripts/studio-acceptance/run-generation-acceptance.ts](../../scripts/studio-acceptance/run-generation-acceptance.ts) (no npm script wired)                                                                                  | The deterministic `GameBlueprintEngine → LuaGenerator → AssetGenerator → GameValidationEngine → RobloxExportArtifactAdapter → ArtifactLoader.lua` path imports inside headless Studio                                     | Same evidence ceiling as above; uses the deterministic fallback blueprint, not the specialist-agent canonical Generate path; still no Play mode                       |
| Import/delivery operator runbook    | [STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md](./STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md), prior results: [STUDIO-ACCEPT-1](./STUDIO-ACCEPT-1_DESKTOP_ACCEPTANCE_RESULT.md), [STUDIO-1G](./STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md) | Connect → generate → `EXPORT_PROJECT` → materialize → verify, on a real desktop Studio session                                                                                                                            | Gameplay/Play-mode behavior — none of these three runs entered Play                                                                                                   |
| Static playability contract         | [server/src/types/playableLua.ts](../../server/src/types/playableLua.ts) `getPlayableLuaIssues`                                                                                                                               | One server script owns world+objective+`RemoteEvent`+`leaderstats`; one client script builds a `ScreenGui` HUD under `PlayerGui` and listens for progress                                                                 | **Nothing about count of objectives (only ≥1), ordering, reward-once, or replay-safety.** These are exactly the properties only a live Play session can show.         |
| Objective provenance                | [server/src/studio/artifacts/GenerationArtifactRecorder.ts](../../server/src/studio/artifacts/GenerationArtifactRecorder.ts) `readLuaGenerationProvenance`                                                                    | `LUA_GENERATION` artifact optionally carries `generationMode` and `objectiveNames`/`objectiveCount`, sourced from `LuaGeneratorAgent`'s `mechanicNames` — **absent, never defaulted**, when the generator didn't stamp it | Whether the objectives actually run correctly at Play time                                                                                                            |
| World runtime mode                  | [server/src/types/worldRuntimeMode.ts](../../server/src/types/worldRuntimeMode.ts)                                                                                                                                            | `resolveWorldRuntimeMode` — explicit `"lua-owned"` / `"materialized-world"`, absent reads as legacy `lua-owned`                                                                                                           | This acceptance run is **lua-owned only**; `materialized-world` is not switched on ([WORLD-1C_SCOPE.md](./WORLD-1C_SCOPE.md) remains blocked/unscoped for production) |

**Conclusion: no missing tooling.** The gap between what exists and what
issue #257 asks for (objectives, ordered progression, reward-once,
no-replay-reward, HUD, spatial output, no fatal Output errors) is not a
tooling gap — it is the gap only a real Play/Play Solo session can close, by
design (`getPlayableLuaIssues` is explicitly static and cannot see runtime
behavior). No new acceptance script or framework was added. This runbook and
the checklist/evidence schema below are the missing artifacts, and they are
documentation, not code.

## Canonical acceptance fixture

Use one project with this exact description text as the Workspace generation
prompt (`goal`/project description field). It is deliberately explicit about
each item issue #257 checks, because `getPlayableLuaIssues` only requires
**one** objective and the specialist agents otherwise degrade to their
generic 3-mechanic fallback (`GameBlueprintEngine.extractMechanics` default:
`["exploration", "interaction", "progression"]`) when the design stage
supplies nothing more specific.

```text
Title: Beacon Trial

Description:
A single-player trial on one small island. The player must complete exactly
three objectives in this fixed order, tracked on a HUD progress list:
1. "Light the Signal Fire" — touch the unlit brazier near the spawn point to
   ignite it.
2. "Recover the Beacon Core" — walk into the glowing Beacon Core part in the
   ruins to collect it. This objective only becomes available after the
   signal fire is lit.
3. "Activate the Beacon" — touch the beacon platform to activate it. This
   objective only becomes available after the Beacon Core is recovered.

Reward: completing "Activate the Beacon" grants the player 100 coins exactly
once. Coins use the standard leaderstats currency. Re-touching the beacon
platform after activation must not grant coins again.

HUD: a screen GUI showing the three objectives in order, each marked
complete as the player finishes it, and a live coin counter.

World: one open island with three distinct named zones (Spawn Camp, Ruins,
Beacon Platform) laid out so the three objectives are visually reachable in
the stated order, with a SpawnLocation at Spawn Camp.
```

This fixture exercises, in one generation:

- **≥3 objectives** — three explicitly named, order-dependent mechanics.
- **Ordered progression** — objective 2 gated on 1, objective 3 gated on 2.
- **Economy/reward** — a single currency, a single reward grant, and an
  explicit no-replay-reward requirement stated in the prompt itself so a
  failure to gate it is a fixture-authored regression, not an ambiguous read.
- **HUD** — an ordered objective list plus a live counter, on top of the
  baseline `ScreenGui`/`PlayerGui` requirement `getPlayableLuaIssues` already
  enforces structurally.
- **Spatial/world output** — three named zones and an explicit
  `SpawnLocation`, which the static contract does **not** check (it only
  checks `Instance.new(...)` + `workspace` on the server) — this is why
  Explorer/Play inspection is required, not optional.

If the specialist-agent pipeline (LLM-backed or its deterministic
`safe_repair`/fallback tier) collapses this into fewer than three distinguishable
objectives, that is itself a finding — record it as `FAIL` on the objective-count
checklist row rather than relaxing the fixture.

## Exact operator steps

1. **Confirm the exact commit under test.**

   ```bash
   git -C . rev-parse HEAD
   git -C ../Frontend rev-parse HEAD
   ```

   Record both SHAs before starting — this is `Backend SHA` / `Frontend SHA`
   in the evidence schema below.

2. **Start the backend.**

   ```bash
   npm run dev:server
   ```

   Confirm it logs a resolved LLM provider (or explicit fallback) at startup —
   record whichever it is; this predicts `generationMode`.

3. **Start the canonical standalone frontend** from `../Frontend` per its own
   run instructions.

4. **Create (or reuse) a project**, and enter the exact fixture text above as
   the project title/description.

5. **Run Generate.** Wait for the execution to reach `completed`.

6. **Identify the execution and artifacts.** From the authenticated frontend,
   or `GET /api/projects/<projectId>/studio/status` after sync (see step 8),
   record:
   - the durable execution ID;
   - the `LUA_GENERATION` artifact ID and content hash;
   - `generationMode` and `objectiveNames`/`objectiveCount` if present on
     that artifact (absent is a valid, honest reading — do not infer).

7. **Install/verify the plugin** per
   [STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md](./STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md)
   §"Verify the Download on Windows" and §"Install as a Local Plugin" if not
   already installed for this Studio profile. Record the verified bundle
   SHA-256.

8. **Open/import in Studio.**
   1. Open a disposable local place.
   2. Connect the plugin panel to the exact project ID.
   3. Trigger the Workspace Studio sync action
      (`POST /api/projects/<projectId>/studio/sync`).
   4. Confirm the plugin panel reaches **Verified** and capture
      `GET /api/projects/<projectId>/studio/status` — this must show
      `artifactVerified: true` and `verifiedExecutionId` equal to the
      execution ID from step 6.
   5. In Explorer, confirm the generated `Script`/`LocalScript`/`ModuleScript`
      instances and non-Lua artifact `StringValue`s exist under
      `ReplicatedStorage/AIStudioArtifacts/<STAGE>/<artifactId>`, matching
      the receipts in the status response.

9. **Enter Play or Play Solo.** Keep the Output window visible and do not
   clear it before capturing evidence.

10. **Execute the PASS/FAIL checklist below**, in order, without skipping a
    row on partial success. Screenshot or transcribe the Output window at
    each objective transition and at the reward grant.

11. **Attempt the replay case explicitly**: after objective 3 completes and
    the reward is granted once, touch the beacon platform again and confirm
    no second reward is granted and no new Output error appears.

12. **Stop Play**, and record the final Output window contents in full
    (success or failure) — do not truncate or summarize away error text.

13. **Fill in the evidence record** (schema below) and attach it as the
    dedicated acceptance result document, following the naming convention of
    prior results (e.g. `STUDIO-ACCEPT-2_DESKTOP_ACCEPTANCE_RESULT.md`).

## PASS/FAIL checklist (issue #257)

Each row is `PASS` / `FAIL` / `NOT_OBSERVED`. `NOT_OBSERVED` is not a pass —
use it only when the row genuinely could not be exercised (e.g. the run
failed before reaching that stage), and the record must say why.

| #   | Check                            | Evidence required                                                                                                                                                                   |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Import/materialization           | Explorer instances match the artifact receipts; plugin panel shows **Verified**; status JSON `artifactVerified: true`                                                               |
| 2   | `SpawnLocation`/world geometry   | A `SpawnLocation` exists at Spawn Camp; the three named zones are present and visually distinct in Explorer/viewport                                                                |
| 3   | Server script runs               | No red Output errors attributable to the generated server `Script` within the first few seconds of Play                                                                             |
| 4   | Client/HUD script runs           | The `ScreenGui` HUD appears under the player's `PlayerGui` with the three objectives listed                                                                                         |
| 5   | Objectives (≥3, correctly named) | Exactly the three fixture objectives appear on the HUD, matching `objectiveNames` from the artifact if present                                                                      |
| 6   | Ordered progression              | Objective 2 is not completable before objective 1; objective 3 is not completable before objective 2 (attempt out-of-order interaction and confirm it is rejected or has no effect) |
| 7   | Reward granted once              | Leaderstats coin value increases by exactly 100 on activating the beacon                                                                                                            |
| 8   | No replay reward                 | Re-touching the beacon platform after activation does not increase coins again                                                                                                      |
| 9   | No fatal Output errors           | Full Play session Output log contains no uncaught Lua error attributable to generated code                                                                                          |

A `FAIL` on any row is the result. Do not average or upgrade a partial pass —
one failing row means the run is `FAIL` for #257, with the specific row(s)
and Output text that failed attached verbatim.

## Evidence schema

Record exactly this shape (fields absent because the run never reached that
stage stay absent — do not fill them with a guess):

```json
{
  "schemaVersion": 1,
  "issue": 257,
  "acceptanceDate": "<ISO 8601 with local timezone>",
  "operator": "<name>",
  "backendCommit": "<git rev-parse HEAD, backend repo>",
  "frontendCommit": "<git rev-parse HEAD, Frontend repo>",
  "projectId": "<exact project ID>",
  "durableExecutionId": "<execution ID>",
  "artifacts": {
    "luaGenerationArtifactId": "<artifact ID>",
    "luaGenerationContentHash": "<sha256>",
    "generationMode": "<primary|repaired|constrained_repair|safe_repair|absent>",
    "objectiveNames": ["..."],
    "objectiveCount": 3
  },
  "worldRuntimeMode": "lua-owned",
  "pluginPackage": {
    "version": "<plugin version>",
    "bundleSha256": "<sha256>"
  },
  "studioEnvironment": {
    "os": "<Windows/macOS version>",
    "studioVersion": "<Studio version()>"
  },
  "checklist": {
    "importMaterialization": "PASS|FAIL|NOT_OBSERVED",
    "spawnLocationWorldGeometry": "PASS|FAIL|NOT_OBSERVED",
    "serverScriptRuns": "PASS|FAIL|NOT_OBSERVED",
    "clientHudRuns": "PASS|FAIL|NOT_OBSERVED",
    "objectivesPresent": "PASS|FAIL|NOT_OBSERVED",
    "orderedProgression": "PASS|FAIL|NOT_OBSERVED",
    "rewardGrantedOnce": "PASS|FAIL|NOT_OBSERVED",
    "noReplayReward": "PASS|FAIL|NOT_OBSERVED",
    "noFatalOutputErrors": "PASS|FAIL|NOT_OBSERVED"
  },
  "verdict": "PASS|FAIL",
  "failedStage": "<exact checklist row, or null if verdict is PASS>",
  "outputLogExcerpt": "<verbatim Output text around the failure, or full session log>",
  "evidenceLimits": [
    "Operator-observed, not machine-verified.",
    "lua-owned world runtime mode only; materialized-world is not exercised.",
    "..."
  ]
}
```

Rules for filling this in, carried over from
[studio.md](../../.claude/rules/studio.md):

- **Operator-observed is not machine-verified.** Label it that way and keep
  it labeled that way; a later edit must not quietly upgrade the evidence
  state.
- A `FAIL` must preserve the exact Output text and the exact checklist row it
  failed at. Never collapse a specific failure into a generic "acceptance
  failed" — that is exactly the failure mode this schema exists to prevent.
- Do not claim `materialized-world` evidence from a `lua-owned` run, and do
  not claim Play-mode/runtime evidence from the structural
  `npm run studio:acceptance` or `run-generation-acceptance.ts` smoke tests —
  those prove engine-level plugin execution and headless import only.

## Failure triage

In addition to the existing table in
[STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md](./STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md#failure-triage):

| Symptom                            | Check                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fewer than 3 objectives on the HUD | Read `objectiveNames`/`objectiveCount` on the `LUA_GENERATION` artifact; if absent or `<3`, the design stage collapsed the fixture — record as `FAIL` on row 5, not a tooling defect |
| Objective 2/3 completable early    | `getPlayableLuaIssues` does not check ordering — this is a real runtime finding, not a contract gap to patch here                                                                    |
| Reward granted more than once      | Same — no static check exists for this; record verbatim Output and the reward-granting script path                                                                                   |
| Plugin never reaches Verified      | Follow the existing STUDIO-1E triage table first; do not proceed to Play until Verified                                                                                              |

## Explicitly out of scope for this preparation

- No `materialized-world` production switch. This run is `lua-owned` only
  (task guard: no gameplay changes, no generator changes).
- No new importer, no plugin redesign.
- No live Studio session was run to produce this document — per instruction,
  only tooling/tests not requiring a live session were exercised during
  preparation.

## Readiness

**No files needed to change in `server/`, `studio-plugin/`, or `scripts/`.**
Existing tooling (`npm run studio:package`, `npm run studio:acceptance`,
`STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md`) already covers everything
automatable. This document supplies the fixture, the operator steps specific
to issue #257, the PASS/FAIL checklist, and the evidence schema that were
missing. Preparation is sufficient as documentation; no acceptance script
changes were required.

**To begin #257 acceptance immediately after this branch merges:**

```bash
git rev-parse HEAD
git -C ../Frontend rev-parse HEAD
npm run dev:server
```

Then follow "Exact operator steps" above, starting at step 3.
