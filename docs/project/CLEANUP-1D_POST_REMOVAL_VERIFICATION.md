# CLEANUP-1D — Post-Removal Repository Verification

**Status:** Implemented and locally verified; protected verification pending
**Tracking issue:** #41
**Baseline:** `release/cutover-1e-candidate@9a728661ee7b0a635af78da56a5d147b296dc23c`
**Deletion authorization:** `false`

## Objective

Complete the final non-deletion cleanup stage after the embedded frontend was
removed. Prove that backend, Studio, tooling, CI, release, and rollback paths
remain independent from the removed root `src/`, and make the tracked
repository inventories deterministic.

## Implemented Boundary

The repository now has exactly two local source zones:

- `server/src` — Node/Express backend and AI platform;
- `studio-plugin/src` — isolated Roblox Studio Luau plugin.

The canonical web client remains
`kazakovak2001-lgtm/Frontend@1036c3ef9705d145cb9700cd14268a33d2abdd58`.
Root `src/` is unknown to path resolution and is a critical forbidden root in
static validation, runtime startup checks, generation targeting, ESLint, and
the staged-file guard.

## Changes

- upgraded the cleanup inventory and verifier to schema v4 / CLEANUP-1D;
- preserved the complete 176-path CLEANUP-1C removal and 12-package pruning
  evidence;
- aligned `ArchitecturePolicy`, `BoundaryValidator`, `RuntimeBoundaryGuard`,
  and `GenerationSandbox` with backend plus Studio ownership;
- retired the `@/` root-frontend alias from codebase indexing and code-review
  guidance;
- indexed backend TypeScript and Studio plugin Luau without indexing root
  `src/`;
- added focused negative controls for root `src/` reintroduction;
- made `_inventory_raw.txt` the exact sorted `git ls-files` inventory;
- made `ProjectStructure.txt` a deterministic tree derived only from tracked
  paths;
- reduced `project_structure.txt` to a UTF-8 compatibility pointer;
- renamed the protected evidence artifact to
  `cleanup-1d-post-removal-verification`;
- retained `legacy-frontend-audit` as a required Merge Gate dependency.

## Preservation

CLEANUP-1D changes no backend API, authentication, storage, generation-output
behavior, Studio protocol, dependency declaration, lockfile, release topology,
canonical Frontend commit, protected default, or rollback reference. It deletes
no file.

Studio package-relative `src/**`, generated Roblox artifact-relative
`src/server`, `src/client`, and `src/shared`, historical documentation, and
negative guard references are classified separately from the removed
repository root.

## Verification

Local verification passed:

- clean npm install: 357 packages;
- TypeScript, architecture, boundary validation, ESLint, and Prettier;
- 61 passing backend test files / 671 passing tests, with one file and one test
  intentionally skipped;
- five focused CLEANUP-1D negative-control tests;
- repository validation over 1,088 tracked files;
- backend build;
- schema-v4 CLEANUP-1D audit with 26 exact changed paths, zero deletions,
  176 removed paths still absent, 12 removed direct packages with zero
  consumers, zero active/tooling exact-path violations, and zero unclassified
  root-relative references.

Protected CI must additionally pass PostgreSQL restart E2E, backend image,
composed HTTPS release, promoted-baseline integrity, Studio packaging where
applicable, CLEANUP-1D evidence, and Merge Gate.

## Rollback

Revert the focused CLEANUP-1D commit. CLEANUP-1C physical removal, standalone
Frontend, active release artifacts, protected default, and pinned rollback
reference remain unchanged.
