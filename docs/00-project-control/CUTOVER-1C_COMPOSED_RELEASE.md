# CUTOVER-1C Composed HTTPS Release

**Status**: Verified  
**Verification date**: July 27, 2026  
**Tracking issue**: #24  
**Implementation pull request**: #25

## Objective

Compose the independently verified backend and standalone Frontend release artifacts behind one HTTPS origin and prove secure browser REST and Socket.IO behavior before any legacy dependency pruning or frontend removal.

## Reuse and Duplication Audit

The release reuses the existing Express API, Socket.IO server, production cookie authentication, PostgreSQL storage provider, standalone Frontend REST adapter, and standalone Frontend realtime client. No second API client, Socket.IO client, auth mechanism, cookie name, or embedded frontend implementation was introduced.

## Exact Release Inputs

- Backend baseline: `2bae4a1299e1094a5d3c3818adb158dbc1b26c77`
- Verified backend implementation head: `8bee44a284244033d73637b3e3cc4bddf72af035`
- Standalone Frontend release commit: `1036c3ef9705d145cb9700cd14268a33d2abdd58`
- CI run: `30312627413` (run #219)
- Evidence artifact ID: `8670986116`
- Evidence artifact name: `cutover-1c-composition-8bee44a284244033d73637b3e3cc4bddf72af035`
- Evidence digest: `sha256:6a941900d9b73bca852d1fe071f148d6ac19eae151b414a9e7f99aa3ad39b57a`

## Verified Topology

```text
https://localhost:8443
├── /                  → standalone Frontend SSR container
├── /api/*             → backend API container
├── /socket.io/*       → backend Socket.IO transport
└── /backend-health    → backend /health
```

PostgreSQL, backend, Frontend, and proxy were all healthy in the composed run. TLS terminated at Nginx while REST and Socket.IO shared the same browser origin and the same host-only access cookie.

## Acceptance Evidence

| Check                                 | Result                                          |
| ------------------------------------- | ----------------------------------------------- |
| Frontend `/health`                    | HTTP 200                                        |
| Backend `/backend-health`             | HTTP 200                                        |
| Frontend SSR `/`                      | HTTP 200 with HTML document                     |
| Allowed credentialed CORS preflight   | HTTP 204                                        |
| Disallowed production origin          | HTTP 403                                        |
| Registration and secure cookies       | Passed                                          |
| Authenticated `/api/platform/auth/me` | HTTP 200                                        |
| Unauthenticated Socket.IO             | Rejected with `Authentication required`         |
| Authenticated Socket.IO               | Connected with the issued access cookie         |
| Engine.IO transport                   | Initial `polling`, upgraded to `websocket`      |
| Cookie scope                          | `Secure`, `HttpOnly`, `SameSite=Lax`, host-only |

The artifact contains `compose-ps.txt`, `compose.log`, `smoke-events.jsonl`, and `smoke-result.json`. The final smoke result records `status: passed` and `authenticatedSocketTransport: websocket`.

## Delivered Boundary

- Release compose definition using independently built backend and Frontend images.
- HTTPS reverse proxy for SSR, REST, Socket.IO, and backend health.
- One shared production-origin policy for Express CORS and Socket.IO CORS.
- Removal of the unused `COOKIE_DOMAIN` release variable while preserving host-only cookies.
- Deterministic composition smoke evidence in CI.
- Aggregate Merge Gate dependency on the composed release job.

## Rollback

Revert focused PR #25. CUTOVER-1A and CUTOVER-1B remain independently verified and deployable. The prior combined `Dockerfile`, `deploy/nginx.conf`, `deploy/docker-compose.yml`, and frozen root `src/` were not modified or deleted, so they remain the rollback inventory.

## Remaining Gate

CUTOVER-1C does not authorize legacy frontend deletion. The next work must prepare release-baseline promotion, inventory every runtime/CI/deployment dependency on root `src/`, rehearse rollback, and then perform removal in a dedicated reviewed cleanup pull request. The oversized PR #1 remains prohibited from direct merge.
