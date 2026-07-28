# CLEANUP-1A Legacy Frontend Decommission Audit

**Status**: Verified  
**Date**: July 28, 2026  
**Tracking issue**: #32  
**Implementation pull request**: #33

## Objective

Create a complete and machine-verifiable decommission inventory for the embedded root React/Vite frontend before any source, configuration, deployment, or dependency deletion is allowed.

CLEANUP-1A is an audit-only stage. It changes no runtime behavior and authorizes no deletion.

## Canonical Product Topology

The active product topology remains:

- backend and Studio integration: `kazakovak2001-lgtm/RobloxAIStudio2`;
- protected default branch: `release/cutover-1e-candidate`;
- CLEANUP-1A minimum ancestor: `35896654419cf3117d7e1d7085f4e7c2084a04be`;
- canonical standalone Frontend repository: `kazakovak2001-lgtm/Frontend`;
- exact Frontend release commit: `1036c3ef9705d145cb9700cd14268a33d2abdd58`.

Active backend and composed-release artifacts were already proven independent from root `src/` by CUTOVER-1D and CUTOVER-1F. CLEANUP-1A reuses those classifications rather than creating a competing release inventory.

## Exact Legacy Source Inventory

Root `src/` currently contains 168 tracked files. The machine-readable inventory records every path and the audit produces a SHA-256 digest and byte size for every file.

The primary embedded frontend entrypoints are:

```text
src/main.tsx
src/App.tsx
src/styles/index.css
```

The source tree includes:

- layout and UI components;
- authentication and toast contexts;
- workspace pipeline components and Socket.IO hooks;
- application layouts and pages;
- frontend API and socket services;
- frontend-only types, constants, hooks and utilities.

Any tracked-file addition, deletion, or rename under root `src/` causes the CLEANUP-1A gate to fail until the classification is reviewed.

## Current Removal Blockers

### Protected TypeScript check

CI still executes root `npx tsc --noEmit`. Root `tsconfig.json` includes only `src` and maps `@/*` to `src/*`. Deleting root `src/` before TypeScript decoupling would therefore break the protected pipeline.

### Root package scripts

The current root commands still expose the embedded Vite application:

- `dev` starts Vite;
- `build` compiles the root frontend and backend, then builds Vite;
- `preview` starts Vite preview;
- `typecheck` compiles both root `src/` and `server/src/`.

### Architecture validator

`scripts/validate-architecture.ts` still describes a dual-root monorepo, declares root `src/` as an active React/Vite frontend, and scans its imports.

The backend domain firewall is already independent: `scripts/validate-boundaries.ts` delegates to `ImportBoundaryValidator`, whose project scan is scoped to `server/src`.

### Archival combined deployment

The old combined `Dockerfile` still:

- copies root `src/`;
- references missing root `public/`;
- runs a Vite build;
- combines frontend and backend output in one image.

The related archival stack is:

```text
Dockerfile
deploy/docker-compose.yml
deploy/nginx.conf
```

Root `docker-compose.yml` is classified separately because it contains PostgreSQL development infrastructure only and has no frontend/Vite routing dependency.

### Generated and stale residue

The current tracked tree retains the stale inventory files:

```text
_inventory_raw.txt
ProjectStructure.txt
```

Those inventories reference historical generated residue that is already absent from the current tree:

```text
vite.config.js
vite.config.d.ts
tsconfig.tsbuildinfo
```

The audit records these paths as known missing rather than treating them as deletion targets. None of them may be mistaken for canonical source or preserved rollback artifacts.

## Dependency Disposition

The following packages are candidates for removal after tooling decoupling and source deletion:

- React runtime and UI packages;
- React type packages;
- Vite and its React plugin;
- Tailwind CSS, PostCSS and Autoprefixer.

The audit uses the TypeScript parser to inspect actual `import`, `export from`, dynamic `import()` and `require()` module specifiers outside root `src/`. Text strings and validation rules are not misclassified as package consumers.

The verified dependency evidence shows:

- `react` has no consumer outside root `src/`;
- `vite` is consumed outside root `src/` only by `vite.config.ts`;
- `socket.io-client` is retained as an operational dependency because `scripts/cutover/verify-composed-release.mjs` uses it to verify authenticated Socket.IO transport in the active composed HTTPS release gate.

## Ordered Removal Waves

### CLEANUP-1B — Tooling decoupling

CLEANUP-1B may modify tooling but may not delete legacy files. It must:

1. remove root frontend compilation from protected TypeScript checks;
2. convert root development, build and typecheck scripts to backend/repository operations;
3. replace dual-root architecture reporting with the canonical backend plus standalone Frontend topology;
4. preserve the full legacy source/config/deployment/dependency inventory for rollback and review.

### CLEANUP-1C — Physical removal and dependency pruning

CLEANUP-1C is the first deletion-authorized stage, but only after CLEANUP-1B is verified and merged. It must:

1. delete root `src/` and legacy frontend entry/configuration files;
2. remove the archival combined frontend deployment stack;
3. remove only residue that actually exists at that stage;
4. prune only dependencies proven legacy-only and update `package-lock.json`;
5. retain or deliberately relocate active operational consumers such as `socket.io-client`.

### CLEANUP-1D — Post-removal verification

CLEANUP-1D must prove:

1. zero active release, CI, tooling or backend references to removed frontend paths;
2. successful backend, Studio, composed-release and independent rollback gates;
3. refreshed repository inventories and project-control documentation;
4. no regression to the promoted default branch or pinned rollback reference.

## Verification Evidence

Protected pull request #33 triggered:

```text
CI Pipeline run: 30324915585 (#277)
Branch head: 4e5d3be6bbcdba0db4830f3d557f788507ff06b9
Audited PR merge ref: b553033d6461dff1f6e659707b3c5961d74558e0
```

The run passed:

- TypeScript Check;
- ESLint;
- Prettier Check;
- Test Suite;
- PostgreSQL Restart E2E;
- Backend Release Image;
- Composed HTTPS Release;
- Promoted Baseline Integrity;
- Legacy Frontend Decommission Audit;
- Repository Validation;
- Commit Message Lint;
- Merge Gate.

The audit result verified:

```text
Status: passed
Tracked root src files: 168
Active release legacy reference violations: 0
Current stage deletion authorized: false
```

Published evidence:

```text
Artifact name: cleanup-1a-legacy-frontend-audit
Artifact ID: 8675337451
Digest: sha256:b6cd21702f1a07ee1ecbb88ac6b4bf3c58737cf157820e739d6335f4c5b31a63
```

The merge commit is recorded in issue #32 after the protected merge operation.

## Machine-Readable Contract

The audit is defined by:

```text
config/cleanup/legacy-frontend-decommission.inventory.json
scripts/cleanup/audit-legacy-frontend-decommission.mjs
```

The CI job `Legacy Frontend Decommission Audit` publishes:

```text
artifacts/cleanup-1a/legacy-frontend-audit-result.json
```

## Safety Boundary

CLEANUP-1A does not modify or delete:

- root `src/`;
- root TypeScript/Vite/Tailwind/PostCSS configuration;
- package scripts, dependencies or lockfile;
- archival deployment files;
- backend APIs, authentication, storage or generation behavior;
- Studio plugin behavior;
- standalone Frontend code or release identity;
- the pinned rollback reference;
- PR #1.

Deletion remains unauthorized until CLEANUP-1B is verified and merged. CLEANUP-1C is the first deletion-authorized stage.

## Rollback

Revert the focused CLEANUP-1A pull request. All runtime code, release artifacts, legacy files, dependencies and rollback references remain unchanged.
