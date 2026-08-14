---
name: studio-acceptance
description: Runs safe, read-only automated acceptance inside the real Roblox Studio engine for the exact canonical plugin sources.
argument-hint: "[optional --place-file PATH or --place-id ID --universe-id ID]"
disable-model-invocation: true
---

# Roblox Studio automated acceptance

Run acceptance for the current exact HEAD. This workflow is read-only with respect to tracked files and external systems. Do not edit, commit, merge, push, publish, upload, change plugin settings, or expose credentials.

Delegate the evidence run and interpretation to `studio-acceptance-engineer`. Inspect the worktree and current project-control authority first. With no arguments, run the exact pre-approved command:

```text
npm run studio:acceptance
```

Only when the caller supplied custom arguments, preserve them with the separator:

```text
npm run studio:acceptance -- $ARGUMENTS
```

With no arguments, use Roblox Studio's disposable empty Baseplate. A supplied local or published place is a load target only and never authorizes saving or publishing. Reject unknown options; the runner intentionally implements no publishing operation.

Require:

1. exact HEAD and worktree state;
2. deterministic plugin package version and bundle SHA-256;
3. a structured result sentinel from Roblox Studio;
4. every engine fixture passing;
5. generated JSON and Markdown evidence paths;
6. explicit separation between automated engine evidence and live end-to-end/operator acceptance.

Classify conclusions as `FACT`, `INFERENCE`, `GAP`, `RISK`, or `RECOMMENDATION`. End with `PASS`, `FAIL`, or `BLOCKED` and state exactly what the verdict proves. Never interpret this workflow alone as proof of backend authentication, an `EXPORT_PROJECT` lifecycle, subjective UX, multiplayer behavior, or release/publish readiness.
