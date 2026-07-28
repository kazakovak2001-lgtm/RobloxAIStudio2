# Production Deployment Checklist

**Last updated:** July 28, 2026

**Status:** Active two-repository release checklist

Use this checklist with the
[Production Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md). A checked item
must be backed by the exact release source or executable evidence; historical
v1 reports are not current deployment proof.

## Release identity

- [ ] Backend source is an exact protected commit on
      `release/cutover-1e-candidate`.
- [ ] Frontend source matches
      `config/cutover/release-baseline.inventory.json#/frontendRelease/commit`.
- [ ] The actual checkout SHAs match the recorded backend/Frontend pair.
- [ ] No root `src/`, root Vite configuration, or former combined deployment
      file is used.
- [ ] The release record contains image digests, not mutable tags alone.

## Backend image

- [ ] Build with `Dockerfile.backend`.
- [ ] Image uses Node.js 22, a non-root runtime user, and
      `NODE_ENV=production`.
- [ ] `GET /health` returns HTTP 200 and `"status":"healthy"`.
- [ ] `STORAGE_PROVIDER=postgres` and `DATABASE_URL` are set.
- [ ] Startup migrations and storage hydration finish before traffic.
- [ ] Startup fails rather than silently falling back when PostgreSQL is
      unavailable.
- [ ] Non-stub deployments inject provider credentials through a reviewed
      secret mechanism; the checked-in acceptance composition intentionally
      omits provider secrets.

## Standalone Frontend image

- [ ] Build the exact `kazakovak2001-lgtm/Frontend` release commit.
- [ ] Set `VITE_API_URL=<release-origin>/api` at build time.
- [ ] Set `VITE_SOCKET_URL=<release-origin>` at build time.
- [ ] Run the non-root SSR image from the Frontend repository `Dockerfile`.
- [ ] `/health` returns the standalone Frontend service identity.
- [ ] `/` returns an SSR HTML document.

## HTTPS composition

- [ ] Use `deploy/docker-compose.release.yml` and
      `deploy/release/nginx.conf`, or an equivalent reviewed topology.
- [ ] Provide `release.crt` and `release.key` through `RELEASE_CERT_DIR`.
- [ ] Remote deployment replaces the acceptance `localhost` server name with
      its reviewed real-host equivalent.
- [ ] Route `/` to Frontend and `/api/`, `/socket.io/`, and
      `/backend-health` to the backend.
- [ ] `RELEASE_ORIGIN` and backend `FRONTEND_URL` are the same exact HTTPS
      origin.
- [ ] `/socket.io/` forwards HTTP/1.1 upgrade headers.
- [ ] Disallowed browser origins receive HTTP 403.

## Authentication and session policy

- [ ] Register/login/refresh JSON contains user/session metadata but no
      reusable access or refresh credential.
- [ ] Authentication validates random storage-backed opaque sessions.
- [ ] No token-signing secret is configured or documented as required.
- [ ] Access cookie `roblox_ai_token` is `Secure`, `HttpOnly`,
      `SameSite=Lax`, host-only, path `/`.
- [ ] Refresh cookie `roblox_ai_refresh` is `Secure`, `HttpOnly`,
      `SameSite=Lax`, host-only, path `/api/platform/auth/refresh`.
- [ ] Refresh credentials are stored only as SHA-256 digests.
- [ ] Rotation invalidates the old access session and consumes the old refresh
      credential before replacement.
- [ ] Replaying a consumed refresh credential returns HTTP 401.
- [ ] Unauthenticated production Socket.IO is rejected.
- [ ] Authenticated Socket.IO connects using the access cookie.
- [ ] Route-level RBAC is not claimed as active; it remains SEC-202 scope.

## Persistence and operations

- [ ] PostgreSQL 16 health is green before backend startup.
- [ ] Persistent volumes and backup location are explicitly configured.
- [ ] `scripts/backup-database.sh` succeeds with the production-compatible
      connection contract.
- [ ] Restore is rehearsed against a separate database.
- [ ] Logs do not expose passwords, cookies, access credentials, refresh
      credentials, or provider keys.
- [ ] Shutdown gives the configured provider an opportunity to flush accepted
      writes.
- [ ] Request-level durability limitations remain tracked under DATA-201.

## Protected evidence

- [ ] `npm run ci` passes.
- [ ] PostgreSQL restart E2E passes.
- [ ] Backend Release Image passes.
- [ ] Composed HTTPS Release passes.
- [ ] Frontend Production Contract passes exactly 40 checks with
      `NODE_ENV=production`.
- [ ] Evidence records both full SHAs, runtime configuration, expected and
      completed check counts, per-check results, health, image details, and
      backend logs.
- [ ] Promoted Baseline Integrity and independent rollback rehearsal pass.
- [ ] Post-Removal Invariant Guard passes.
- [ ] Merge Gate passes.

The canonical executable checks are:

- [`server/src/__tests__/harden2a.auth-contract.test.ts`](../server/src/__tests__/harden2a.auth-contract.test.ts);
- [`scripts/cutover/verify-composed-release.mjs`](../scripts/cutover/verify-composed-release.mjs);
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml);
- Frontend `scripts/e2e-backend.mjs` at the exact pinned Frontend commit.

## Current verified pair

The INT-201 post-merge baseline is:

| Field             | Value                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Backend           | `b30be04ce3c5458902561472d371f753b28f08c5`                                                            |
| Frontend          | `739b43cbc5f991c1852e80b30fe38c0e7c02d681`                                                            |
| Workflow          | [backend CI run #307](https://github.com/kazakovak2001-lgtm/RobloxAIStudio2/actions/runs/30350138128) |
| Contract artifact | `8684538568`                                                                                          |
| Contract digest   | `sha256:0babbaf1239615e15479a4adbbcc5f5745965632fb3417c06bc2ee9a70c3c0a9`                             |
| Result            | 40/40 checks and Merge Gate passed                                                                    |

This table records verified evidence; the active Frontend pin remains the JSON
inventory field above.

## Release and rollback

- [ ] Deploy only after every protected check is green for the exact pair.
- [ ] Retain the independently deployable backend and Frontend image digests.
- [ ] Retain the protected `backup/default-before-cutover-1e` reference.
- [ ] Record database backup and migration state before cutover.
- [ ] Verify Frontend health, backend health, SSR, auth, refresh replay
      rejection, REST ownership isolation, and Socket.IO after deployment.
- [ ] Do not use the removed historical combined stack as rollback.

Development-mode runs are useful for feature work but intentionally bypass
authentication. They do not satisfy any auth or cross-user isolation checkbox.
