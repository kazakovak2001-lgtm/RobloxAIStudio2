# CUTOVER-1A — Backend-Only Release Artifact

**Status:** In implementation  
**Tracking issue:** #21  
**Baseline:** `feature/plugin-merge` at `3608b5bee35501dc8d01e75871d3d23f80cd65b0`

## Objective

Prove that the canonical backend can be built, started, and health-checked without copying or compiling the frozen legacy frontend in root `src/`.

This slice does not remove the legacy frontend. It creates the first independently deployable release boundary required before removal can be considered.

## Pre-implementation findings

The audit confirmed that the current combined deployment path still depends on the legacy frontend:

- root `package.json` runs Vite for `dev`, `build`, and `preview`;
- root `tsconfig.json` includes only `src/`;
- the existing `Dockerfile` copies `src/`, `public/`, `index.html`, and Vite/Tailwind configuration;
- `deploy/nginx.conf` expects a static SPA in `/usr/share/nginx/html`;
- `deploy/docker-compose.yml` starts a separate Nginx container without providing that container the built frontend files;
- the standalone Frontend is TanStack Start/Nitro SSR, so it cannot be substituted as a static legacy `dist/` directory;
- PR #1 is diverged and too large to serve as the release-promotion mechanism.

## Implementation boundary

CUTOVER-1A adds:

1. `Dockerfile.backend` — compiles and packages only `server/`;
2. `deploy/docker-compose.backend.yml` — PostgreSQL plus backend API/Socket.IO, without the legacy SPA Nginx service;
3. a required CI `Backend Release Image` job that builds the image, starts the container, and verifies `GET /health`;
4. the backend-image job as a dependency of the aggregate Merge Gate.

The existing `Dockerfile`, `deploy/docker-compose.yml`, legacy `src/`, and standalone Frontend remain unchanged for rollback and comparison.

## Target release architecture

```text
Standalone Frontend repository
TanStack Start / Nitro SSR process
                |
                | REST + Socket.IO
                v
RobloxAIStudio2 backend-only image
Express + Socket.IO + Studio runtime
                |
                v
PostgreSQL
```

The frontend and backend are separate release artifacts. Their boundary remains the existing versioned REST, Socket.IO, authentication-cookie, and Studio contracts.

## Validation contract

The focused pull request must prove all of the following:

- Docker build succeeds without copying `src/`;
- compiled backend starts from `dist/server/index.js`;
- production container returns HTTP 200 from `/health`;
- existing TypeScript, ESLint, Prettier, tests, repository validation, PostgreSQL restart E2E, and Merge Gate remain green;
- no REST, Socket.IO, Studio, storage, or authentication behavior changes.

## Known follow-up work

CUTOVER-1A deliberately does not complete the entire cutover. The next focused slices are:

1. package the standalone Frontend SSR process as an independent release artifact;
2. define cross-repository release composition, environment variables, cookie/CORS topology, and rollback;
3. prove authenticated REST and Socket.IO traffic through the composed release topology;
4. separate backend dependencies and scripts from legacy Vite dependencies;
5. remove root `src/` only in a final isolated cleanup pull request after all removal gates pass.

## Rollback

Revert the CUTOVER-1A pull request. The prior combined Dockerfile and compose files remain untouched during this slice.
