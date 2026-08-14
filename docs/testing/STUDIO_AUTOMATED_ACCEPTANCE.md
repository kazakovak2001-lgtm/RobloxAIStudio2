# Roblox Studio automated acceptance

This runbook adds deterministic, machine-readable acceptance inside the real Roblox Studio engine without adding a second plugin, bridge, protocol, or publishing path.

## What the command proves

Run from the repository root:

```bash
npm run studio:acceptance
```

The runner fails closed unless the repository is clean, captures `HEAD` before reading any package source, and verifies that the same clean revision remains checked out after source capture and after Studio exits. The runner then:

1. resolves an installed Roblox Studio binary or `ROBLOX_STUDIO_PATH`;
2. creates the deterministic canonical plugin package in an isolated temporary directory;
3. injects the exact `ArtifactLoader`, `UITreeMaterializer`, and `WorldSceneMaterializer` sources into temporary `ModuleScript` instances;
4. executes them through the real Studio Luau VM using the documented `RunScript` CLI task;
5. tests script-class mapping, exact source assignment, metadata idempotence, real UI/world instances, allowlists, atomic rejection, and creator-owned collision protection;
6. removes every acceptance-owned DataModel instance;
7. keeps each in-flight Studio output in an isolated temporary run directory;
8. publishes the completed JSON result, Markdown report, and raw Studio output into an immutable directory under `artifacts/studio-acceptance/runs/`, then atomically updates `artifacts/studio-acceptance/latest/pointer.json` to select that complete run.

The default target is Studio's disposable empty Baseplate. Optional load-only targets are:

```bash
npm run studio:acceptance -- --place-file C:\path\to\test-place.rbxl
npm run studio:acceptance -- --place-id 123 --universe-id 456
```

The place ID and universe ID must be supplied together. Loading a published place does not save or publish it.

## Safety boundary

The runner has no publish, upload, save, Open Cloud, API-key, browser-session, or plugin-setting operation. Unknown options fail closed. Never add a Studio API key to this command: Roblox Studio echoes the executed Luau into its output, so embedding a credential in the script would persist it in evidence logs.

Acceptance fixtures use a per-run GUID namespace and clean up only instances they created. Concurrent commands never share an in-flight Studio output file. Completed run directories are immutable, and an incomplete publication never removes or hides the run selected by the prior `latest/pointer.json`. No runtime handle is persisted. Generated reports are ignored local evidence and do not become release truth merely by existing.

## Evidence boundary

A `PASS` proves that the exact canonical materializer sources on the recorded commit executed successfully in the recorded Roblox Studio binary and satisfied the deterministic fixtures. It strengthens the older source-substring tests with real engine execution.

It does **not** prove:

- a live authenticated backend/plugin connection;
- durable generation, `EXPORT_PROJECT`, acknowledgement, or receipt verification;
- the plugin panel's visual states;
- Play Solo, client/server, or multiplayer behavior;
- subjective UX, camera feel, fun, performance, or production readiness;
- publishing.

Those claims still require their own evidence. The existing [STUDIO-1e desktop runbook](../00-project-control/STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md) and accepted [STUDIO-1g result](../00-project-control/STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md) remain the authority for the full historical delivery lifecycle. This runner must not retroactively reinterpret them.

## Claude Code workflow

Use:

```text
/studio-acceptance
```

or:

```text
Use studio-acceptance-engineer to run Studio acceptance on the exact current HEAD. Do not publish, save, enter credentials, or edit tracked files. Return FACT/INFERENCE/GAP/RISK/RECOMMENDATION and a final PASS/FAIL/BLOCKED verdict with the exact evidence boundary.
```

The agent is read-only and cannot edit, merge, push, publish, or change plugin settings.
The shared project settings pre-approve only the exact default `npm run studio:acceptance` command, so the agent can complete the safe Baseplate run without an interactive Bash approval. Runs with custom place arguments still require their normal permission decision.
