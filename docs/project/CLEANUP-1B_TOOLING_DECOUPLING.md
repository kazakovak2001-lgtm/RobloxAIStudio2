# CLEANUP-1B Legacy Frontend Tooling Decoupling

**Status**: Implementation complete; protected CI verification pending
**Date**: July 28, 2026
**Tracking issue**: #34

## Objective

Remove the frozen root React/Vite frontend from active backend development,
build, typecheck, test, and architecture-tooling paths without deleting or
modifying any legacy source, configuration, deployment, or dependency file.

CLEANUP-1B is a tooling-only stage. It prepares the repository for the
separately reviewed CLEANUP-1C removal wave, but it does not authorize deletion
or dependency pruning.

## Pre-Implementation Verification

The implementation reuses the CLEANUP-1A inventory and verifier rather than
creating a parallel cleanup system.

The verified baseline is:

- backend and Studio repository:
  `kazakovak2001-lgtm/RobloxAIStudio2`;
- protected default branch: `release/cutover-1e-candidate`;
- CLEANUP-1A merge commit:
  `99b0de4a3b493d1e1fa98173deea8fae59d57842`;
- canonical standalone Frontend:
  `kazakovak2001-lgtm/Frontend`;
- exact Frontend release commit:
  `1036c3ef9705d145cb9700cd14268a33d2abdd58`;
- frozen root `src/` inventory: 168 tracked files.

The existing backend domain firewall already scans only `server/src` and is
retained unchanged. CUTOVER-1D and CUTOVER-1F already prove active-release
isolation and independent rollback, so CLEANUP-1B reuses that evidence.

## Coupling Removed

### Root package commands

The root commands now resolve to canonical backend or repository operations:

| Command             | CLEANUP-1B behavior                             |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Starts the existing backend development server  |
| `npm run build`     | Runs the existing backend build                 |
| `npm run preview`   | Starts the compiled backend                     |
| `npm run typecheck` | Compiles only `server/tsconfig.json`            |
| `npm run lint`      | Checks backend, scripts, and active test config |

The existing `dev:server`, `build:server`, `start`, architecture, boundary, and
repository validation implementations are reused.

### Backend test contract

Vitest previously discovered both backend and frozen frontend tests and
implicitly loaded root `vite.config.ts`. That was a hidden active dependency on
the legacy React/Vite toolchain.

`config/testing/vitest.backend.config.ts` now scopes the existing Vitest runner
to:

```text
server/src/**/*.test.ts
server/src/**/*.spec.ts
```

The normal test command, watch command, and PostgreSQL restart acceptance use
this same backend-only configuration. No second test runner was introduced.

### Protected TypeScript CI

The TypeScript job now calls the single root `typecheck` contract. It no longer
executes root `npx tsc --noEmit`, so the protected pipeline does not compile the
frozen `src/` project.

### Architecture reporting

`validate-architecture.ts` now reports the canonical topology:

- active backend: `server/src`;
- active Studio plugin: `studio-plugin/src`;
- canonical web client: the external standalone Frontend repository;
- root `src/`: frozen migration inventory only.

Backend React imports, backend-to-legacy imports, forbidden source roots,
orphan modules, and deprecated runtime usage remain guarded. The existing
domain-level `ImportBoundaryValidator` remains unchanged.

## Machine-Verified Preservation

The evolved CLEANUP verifier fails if this stage changes anything outside its
explicit tooling and documentation allowlist.

It also requires:

- exact CLEANUP-1A ancestry;
- the same 168 tracked root `src/` files;
- no changes to legacy entrypoints, TypeScript/Vite/Tailwind/PostCSS
  configuration, archival deployment files, PostgreSQL-only development
  compose file, stale inventories, or package lock;
- identical runtime and development dependency maps;
- the exact backend-only package, CI, test, and architecture contracts;
- the existing CUTOVER release inventory and canonical Frontend identity;
- zero active-release legacy reference violations;
- the cleanup job to remain a dependency of `Merge Gate`;
- `currentStageDeletionAuthorized=false`.

`socket.io-client` remains retained because the active composed HTTPS verifier
uses it for authenticated Socket.IO acceptance.

## CI Evidence

The protected CI run must pass:

- TypeScript Check;
- ESLint;
- Prettier Check;
- backend Test Suite;
- PostgreSQL Restart E2E;
- Backend Release Image;
- Composed HTTPS Release;
- Promoted Baseline Integrity;
- Legacy Frontend Tooling Decoupling;
- Repository Validation;
- Commit Message Lint;
- Merge Gate.

The cleanup job publishes:

```text
artifact: cleanup-1b-tooling-decoupling
path: artifacts/cleanup-1b
result: legacy-frontend-audit-result.json
```

The exact CI run, artifact ID, digest, pull request, and merge commit are added
after protected verification completes.

## Safety Boundary

CLEANUP-1B does not delete or modify:

- root `src/`;
- root `index.html`, `tsconfig.json`, `vite.config.ts`, Tailwind, or PostCSS
  configuration;
- the archival combined Dockerfile, Nginx configuration, or compose stack;
- package dependency declarations or `package-lock.json`;
- backend runtime code, APIs, authentication, persistence, or generation;
- Studio protocol or plugin behavior;
- standalone Frontend code or release identity;
- promoted default or rollback references;
- PR #1.

Deletion remains unauthorized in this stage.

## Next Authorized Stage

CLEANUP-1C may begin only after CLEANUP-1B is protected, verified, and merged.
It is the first deletion-authorized stage and must remove the physical legacy
frontend and prune only dependencies proven legacy-only by the existing
inventory.

## Rollback

Revert the focused CLEANUP-1B pull request. The CLEANUP-1A inventory, active
backend/Frontend releases, independent rollback path, and every legacy
source/configuration/deployment/dependency file remain preserved.
