# RUNTIME-PLAYTEST-1 — Roblox Runtime Playtest Result

**Status:** Complete — operator-observed; narrative-level evidence, not a full
machine-verified receipt trail (see Evidence limits below)
**Roadmap authority:** `RUNTIME-PLAYTEST-1`, dependency `STUDIO-ACCEPT-1`

## Decision

A generated vertical-slice project was delivered through the canonical Studio
path and run in Roblox Studio Play mode by the operator. The world rendered,
the player spawned in the correct location, the stated objective was
understandable, the collectible interaction worked, the HUD updated live, and
the objective was completable with no reported runtime errors. This closes the
authoritative-runtime-evidence gap identified by ROADMAP-AUDIT-1 for the
vertical-slice scope; it does not claim a complete, publishable Roblox game.

## Test identity

| Field                  | Value                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend PR under test  | #177 "fix: repair unplayable ollama lua output"                                                                                                                                                                          |
| Backend PR head        | `30b84a9059a9d379173e80c38d14ad0c7f6ad1a9`                                                                                                                                                                               |
| Backend merge commit   | `f3b89c9048884528eb8baa4d5a19e406cc1c6315` (tree-identical to PR head; confirmed this session with `git rev-parse <sha>^{tree}`)                                                                                         |
| Frontend PR under test | #35 "Use generated artifacts for playtest and repair"                                                                                                                                                                    |
| Frontend PR head       | `fd3d995cd2b7d5e8a6fad0cb4a04f5da4a3360c8`                                                                                                                                                                               |
| Frontend merge commit  | `06203ad0c296892d02467b2b566409fa10201cf6` (code-tree identical to PR head; only `paired-release.json`/`FRONTEND_BACKEND_INTEGRATION_STATUS.md` differ, added post-test — confirmed this session with `git diff --stat`) |
| Project ID             | `proj-5981082b-8`                                                                                                                                                                                                        |
| Durable execution ID   | `exec-1786017156460`                                                                                                                                                                                                     |
| Export command ID      | `cmd-9c378af7-2`                                                                                                                                                                                                         |
| Studio client ID       | `studio-1081fdb6`                                                                                                                                                                                                        |
| Roblox Studio          | `0.733.0.7330989`                                                                                                                                                                                                        |
| Plugin version         | `1.8.0`                                                                                                                                                                                                                  |
| Verified artifacts     | `8` (`verificationStatus: verified`, `verifiedArtifactCount: 8`)                                                                                                                                                         |

## Generated world and runtime evidence

The execution produced real runtime Lua, not placeholders:

- `AdventureBootstrap` server script;
- a client HUD script;
- a shared module;
- RemoteEvent `ObjectiveProgress`;
- a `GeneratedAdventure` Workspace folder containing a green spawn pad, five
  gold collectible orbs, a `leaderstats` `Score` value, and goal text.

Observed in Roblox Play mode:

- the player spawned on the green pad;
- the stated objective ("collect the orbs") was visible and understandable;
- collecting an orb removed it and incremented the score;
- the HUD/progress counter updated live from `0/5` through `5/5`;
- the objective was completable;
- no runtime errors were reported during the session.

## Evidence limits

This result is based on the operator's direct observation of the Play-mode
session and the backend's `verifiedArtifactCount`/`verificationStatus` fields,
not a fully captured machine-verifiable trail. Unlike
[STUDIO-ACCEPT-1](./STUDIO-ACCEPT-1_DESKTOP_ACCEPTANCE_RESULT.md), this record
does **not** include:

1. the exact per-artifact ID/hash receipt table for this execution;
2. the exact command-lifecycle timestamps (queued/delivered/acknowledged/verified);
3. the raw authenticated project-status JSON response for this execution;
4. the plugin bundle SHA-256 for the exact package used in this run (the only
   recorded bundle hash, `86e102b663d48925f9e313248761bb2d91d7e0794252f6c04e50496d8ba05696`,
   is tied to STUDIO-ACCEPT-1's backend commit `3230d236...`, a different commit
   than this test);
5. screenshots or video of the Play-mode session.

If any of items 1–5 exist from the original test session, they should be
added to this record. Until then, treat this as sufficient evidence that the
generation → Studio delivery → Play-mode runtime path works end-to-end for a
small vertical slice, but not as a byte-exact reproducible receipt the way
STUDIO-ACCEPT-1 is.

## Closure and next gate

RUNTIME-PLAYTEST-1 is complete at the evidence level described above. The next
product-critical phase is REPAIR-1: replacing the simulated repair engine
(`RepairEngine`/`RepairExecutor`'s `simulateImprovement()`, which does not
touch Lua source or create new artifacts) with a real artifact-applying
repair, redelivery, and revalidation loop.
