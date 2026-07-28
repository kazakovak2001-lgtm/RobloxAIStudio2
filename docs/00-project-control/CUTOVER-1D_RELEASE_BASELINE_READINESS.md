# CUTOVER-1D Release-Baseline Readiness

**Status**: Verified  
**Verification date**: July 27, 2026  
**Tracking issue**: #26  
**Implementation pull request**: #27

## Objective

Prepare, but do not perform, release-baseline promotion by proving branch divergence, active-release isolation from the embedded frontend, complete semantic disposition of the default-only commit, and an executable rollback to the independently deployable CUTOVER-1A backend and CUTOVER-1B Frontend artifacts.

## Verified Identity

- backend readiness head: `c716b96aac8e0cd9aa61b7ed119002456e856ff3`;
- integration baseline: `309e897b6f56633e290c72f099729a603c2fd13e`;
- integration branch: `feature/plugin-merge`;
- default branch: `standing-pentaceratops`;
- default tip: `91a1626d080a4bc22ce20648c4ff10481ae6e299`;
- merge base: `89202d409e217a1472dbd70fa4bf9c00ecdf7881`;
- integration divergence: 184 commits ahead and 1 commit behind;
- exact Frontend release commit: `1036c3ef9705d145cb9700cd14268a33d2abdd58`;
- CI run: `30315780241` (#251);
- readiness artifact ID: `8672132224`;
- readiness artifact digest: `sha256:685a2432c3e9ac8732f9824dbe321733392e1b5c8607fd9d4e0f8a7e976d850d`.

## Machine-Verified Release Boundary

The release-baseline inventory and verifier established that the active release path consists of:

- `Dockerfile.backend`;
- `deploy/docker-compose.backend.yml`;
- `deploy/docker-compose.release.yml`;
- `deploy/release/nginx.conf`;
- the composed-release smoke verifier;
- the current CI pipeline;
- canonical Studio plugin packaging.

Five forbidden legacy-reference classes were evaluated across those files. The result recorded `legacyReferenceViolations: 0`. The active backend, Frontend, HTTPS proxy, Socket.IO route, and Studio package path do not copy or execute root `src/`, root `public/`, the legacy Vite application, root Vite/Tailwind/PostCSS configuration, or the prior combined deployment stack.

## Default-Branch Divergence Decision

The only commit reachable exclusively from the default branch is:

```text
91a1626d080a4bc22ce20648c4ff10481ae6e299
Identity & Access Management
```

Every changed path from that commit is explicitly classified in `config/cutover/release-baseline.inventory.json`. The commit contains early generation/IAM work, generated `dist/` cleanup, temporary diagnostics, tooling metadata, and an obsolete SSE migration plan. Current authentication, ownership, durable storage, generation, Socket.IO, and release architecture supersede those changes through separately tested implementations.

The disposition is therefore:

```text
semantically-superseded-do-not-cherry-pick
```

It must not be blindly merged or cherry-picked into the verified integration tree. PR #1 also remains prohibited from direct merge.

## Rollback Finding

The prior combined stack is not an executable rollback mechanism. Its root `Dockerfile` still references `public/`, but that directory is absent. The old Dockerfile, Nginx, compose, Vite, Tailwind, PostCSS, root `src/`, and related package scripts remain classified as archival or local legacy-development inventory only.

The executable rollback mechanism is:

1. stop and clean up the composed HTTPS release;
2. build and start the independent CUTOVER-1A backend artifact;
3. build and start the exact CUTOVER-1B Frontend artifact;
4. verify backend `/health`;
5. verify Frontend `/health`;
6. verify the Frontend root SSR HTML document.

CI run #251 completed this rehearsal successfully:

```text
Independent backend health: HTTP 200
Independent Frontend health: HTTP 200
Independent Frontend SSR document: HTTP 200 with HTML
Rollback rehearsal result: passed
```

The captured backend health payload reported `status: healthy`; the Frontend payload reported `status: healthy` and service `roblox-ai-studio-frontend`.

## Delivered Controls

- machine-readable release and legacy dependency inventory;
- exact branch-tip, merge-base, ahead/behind, and ancestor assertions;
- complete default-only path classification;
- active-release forbidden-reference enforcement;
- explicit classification of legacy development scripts and packages;
- known-missing archival path enforcement;
- deterministic independent rollback rehearsal;
- success and failure evidence artifacts;
- mandatory `Release Baseline Readiness` dependency in the aggregate Merge Gate.

## Promotion Plan

CUTOVER-1D authorizes preparation for a future administrative release-baseline promotion only. The future operation must:

1. preserve the verified integration tree rather than merge PR #1;
2. not cherry-pick `91a1626d...`;
3. review branch protection and required checks before changing the release/default reference;
4. preserve `309e897b6f56633e290c72f099729a603c2fd13e` as the documented pre-promotion rollback point;
5. rerun TypeScript, ESLint, Prettier, full tests, PostgreSQL restart E2E, backend image, composed HTTPS release, release-baseline readiness, repository validation, and Merge Gate after promotion;
6. keep legacy cleanup in a separate reviewed pull request.

## Non-Authorization

CUTOVER-1D does not authorize:

- changing the repository default branch in PR #27;
- deleting root `src/`;
- deleting legacy Vite, Tailwind, PostCSS, package, or deployment inventory;
- merging or rebasing PR #1;
- restoring the absent `public/` directory merely to revive the obsolete combined stack;
- altering business APIs, storage schemas, Studio behavior, Frontend UI, or the verified release topology.

## Rollback of This Slice

Revert focused PR #27. CUTOVER-1A, CUTOVER-1B, and CUTOVER-1C remain independently verified and unchanged.
