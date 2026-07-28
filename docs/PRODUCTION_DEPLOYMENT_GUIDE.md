# Production Deployment Guide

**Last updated:** July 28, 2026

**Status:** Active two-repository release contract

This guide describes the current release topology. The backend and standalone
Frontend are independent images composed behind one HTTPS origin. The removed
root React/Vite application and the former combined `Dockerfile` /
`deploy/docker-compose.yml` stack are historical only and are not deployment or
rollback paths.

## Canonical release topology

| Surface                | Canonical source                                                                | Release artifact                                                  |
| ---------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Backend/API/Socket.IO  | This repository                                                                 | `Dockerfile.backend`                                              |
| Web application        | [`kazakovak2001-lgtm/Frontend`](https://github.com/kazakovak2001-lgtm/Frontend) | Frontend repository `Dockerfile`                                  |
| PostgreSQL + backend   | This repository                                                                 | `deploy/docker-compose.backend.yml`                               |
| Full HTTPS composition | Both repositories                                                               | `deploy/docker-compose.release.yml` + `deploy/release/nginx.conf` |

The exact Frontend release commit is
`config/cutover/release-baseline.inventory.json#/frontendRelease/commit`.
Protected CI reads this field directly; do not maintain a second workflow pin.

## Prerequisites

- Docker 20.10+ with Docker Compose v2
- Node.js 22.12+ and npm 10+ for local verification
- PostgreSQL 16 for parity with the composed release
- `curl` and `jq` for the health and release-identity commands below
- an HTTPS certificate and key named `release.crt` and `release.key`
- a reviewed secret-injection mechanism and at least one provider credential
  for non-stub generation

## Backend-only deployment

The backend-only composition is useful when the standalone Frontend is deployed
by a separate platform:

```bash
POSTGRES_PASSWORD=replace-me \
FRONTEND_URL=https://studio.example.com \
docker compose --file deploy/docker-compose.backend.yml up --detach --build

curl --fail http://127.0.0.1:5000/health
```

`FRONTEND_URL` must be the exact browser origin allowed by production CORS and
Socket.IO origin checks. The backend container always runs with
`NODE_ENV=production` and `STORAGE_PROVIDER=postgres`.

## Full same-origin HTTPS deployment

Use an isolated checkout of the exact Frontend release commit:

```bash
FRONTEND_SHA="$(jq --raw-output \
  '.frontendRelease.commit' \
  config/cutover/release-baseline.inventory.json)"

git clone https://github.com/kazakovak2001-lgtm/Frontend standalone-frontend
git -C standalone-frontend checkout --detach "$FRONTEND_SHA"

export RELEASE_ORIGIN=https://localhost:8443
export RELEASE_PORT=8443
export BACKEND_IMAGE=roblox-ai-studio-backend:release
export FRONTEND_IMAGE=roblox-ai-studio-frontend:release
export POSTGRES_PASSWORD=replace-me
export RELEASE_CERT_DIR="$PWD/.release-certs"

mkdir -p "$RELEASE_CERT_DIR"
# Place release.crt and release.key in $RELEASE_CERT_DIR.

docker build \
  --file Dockerfile.backend \
  --tag "$BACKEND_IMAGE" \
  .

docker build \
  --build-arg VITE_API_URL="$RELEASE_ORIGIN/api" \
  --build-arg VITE_SOCKET_URL="$RELEASE_ORIGIN" \
  --tag "$FRONTEND_IMAGE" \
  standalone-frontend

docker compose \
  --project-name roblox-ai-release \
  --file deploy/docker-compose.release.yml \
  up --detach
```

The proxy routes `/` to the Frontend, `/api/` and `/socket.io/` to the backend,
and `/backend-health` to backend health. Both browser transports therefore use
the same HTTPS origin.

The checked-in Nginx file uses `localhost` and the deterministic certificate
filenames required by protected acceptance. A remote deployment must use an
equivalent reviewed proxy configuration and certificate for its real hostname
while preserving the same routes, origin, and upgrade headers.

## Required runtime configuration

| Variable                               | Required                   | Purpose                                             |
| -------------------------------------- | -------------------------- | --------------------------------------------------- |
| `NODE_ENV=production`                  | Yes                        | Enables production auth and cookie policy           |
| `STORAGE_PROVIDER=postgres`            | Yes for durable deployment | Prevents process-local product state                |
| `DATABASE_URL`                         | Yes with PostgreSQL        | Database connection used after migrations/hydration |
| `FRONTEND_URL`                         | Yes                        | Exact allowed browser origin                        |
| `PORT`                                 | No                         | Backend port; image default is `5000`               |
| `OPENAI_API_KEY` / other provider keys | As needed                  | Non-stub model access                               |

The checked-in acceptance composition intentionally omits provider secrets and
can verify release transport in stub mode. A non-stub deployment must inject
the selected provider variables into the backend service through the deployment
platform's secret mechanism; never commit them to Compose or environment files.

Authentication uses random opaque access and refresh credentials backed by the
configured storage provider. It does not use signed tokens or a signing secret.
Production browser credentials are delivered only through host-only
`Secure`, `HttpOnly`, `SameSite=Lax` cookies:

- access cookie `roblox_ai_token`, path `/`;
- refresh cookie `roblox_ai_refresh`, path
  `/api/platform/auth/refresh`.

Register, login, and refresh response bodies contain no reusable credential.
Refresh values are persisted only as SHA-256 digests and are single-use after
rotation. Explicit Bearer input remains for non-browser tooling; API-key clients
retain their separate contract.

## Database lifecycle

With `STORAGE_PROVIDER=postgres`, startup:

1. requires `DATABASE_URL`;
2. applies pending versioned migrations;
3. hydrates the configured storage provider;
4. migrates legacy plaintext refresh records to digest-only records and flushes
   them;
5. starts accepting traffic.

The server does not silently fall back to in-memory storage when PostgreSQL
configuration or startup fails. `STORAGE_PROVIDER=inmemory` is supported for
tests and short-lived development only.

## Verification

Run the executable composed-release smoke test after the services are healthy:

```bash
npm ci

RELEASE_ORIGIN="$RELEASE_ORIGIN" \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
node scripts/cutover/verify-composed-release.mjs
```

The verifier checks Frontend/backend health, SSR HTML, allowed and rejected
origins, credential-free register/login/refresh responses, exact cookie policy,
`/auth/me`, refresh rotation and replay rejection, unauthenticated Socket.IO
rejection, and authenticated polling-to-WebSocket upgrade.

Current executable evidence:

- [`harden2a.auth-contract.test.ts`](../server/src/__tests__/harden2a.auth-contract.test.ts)
  proves the native auth/session/cookie contract;
- [`verify-composed-release.mjs`](../scripts/cutover/verify-composed-release.mjs)
  proves the same-origin HTTPS release behavior;
- [backend CI run #307](https://github.com/kazakovak2001-lgtm/RobloxAIStudio2/actions/runs/30350138128)
  passed the protected 40-check production contract for backend
  `b30be04ce3c5458902561472d371f753b28f08c5` and Frontend
  `739b43cbc5f991c1852e80b30fe38c0e7c02d681`.

Development mode intentionally bypasses REST and Socket.IO authentication.
Development-mode success is never valid authentication or cross-user isolation
evidence.

## Backup and restore

Create a timestamped PostgreSQL backup:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database \
RETENTION_DAYS=14 \
./scripts/backup-database.sh
```

Restore procedures must be rehearsed against a separate database before a
production cutover. The release rollback boundary is the independently built
backend and Frontend images plus the protected pre-promotion reference; the
deleted combined stack is not executable rollback.

## Troubleshooting

- Backend unhealthy: inspect `docker compose ... logs backend`, confirm
  PostgreSQL health, `DATABASE_URL`, and migration completion.
- Frontend unhealthy: inspect the Frontend container and confirm its `/health`
  returns the standalone SSR service identity.
- Browser 403: make `FRONTEND_URL`, `RELEASE_ORIGIN`, proxy host, and browser
  origin identical.
- Browser auth fails over HTTP: production cookies are `Secure`; use HTTPS.
- Socket.IO fails: proxy `/socket.io/` with HTTP/1.1 upgrade headers and keep
  the access cookie path at `/`.
- Cross-user checks appear to pass only in development: rerun the protected
  contract with `NODE_ENV=production`.
