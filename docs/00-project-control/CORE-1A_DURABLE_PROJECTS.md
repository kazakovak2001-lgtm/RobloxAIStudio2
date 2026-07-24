# CORE-1a — Durable Identity, Projects, and Project Contracts

**Objective:** Make the authenticated project path use one configured storage provider from server startup through API responses.

**Dependencies:** CUTOVER-0 and CI-BASELINE-1 merged into `feature/plugin-merge`.

**Complexity:** M
**Estimated effort:** 1–2 days
**Risk level:** Medium

## Delivered Scope

- One storage provider is created during server bootstrap and injected into project, identity, user, generation-history, and API-key services.
- `STORAGE_PROVIDER=postgres` now requires `DATABASE_URL`; startup runs migrations and loads the PostgreSQL cache before listening for requests. It no longer intentionally degrades to cache-only mode in this configuration.
- `kv_store` is a tracked PostgreSQL migration and accepted writes are flushed during graceful shutdown.
- Users, credential hashes, roles, sessions, projects, and generation history now use the configured storage boundary instead of route-local maps.
- Project endpoints require an authenticated owner in every environment. Anonymous list/create access and the `anonymous` project owner fallback are removed.
- Public project updates are allow-listed. Server-managed ownership, counters, lifecycle status, timestamps, and quality fields cannot be supplied by a browser request.
- The project response maintains the standalone frontend's existing aliases (`type`, `progress`) while also returning canonical internal fields (`gameType`, `qualityScore`). No legacy frontend code changed.

## Contract Impact

| Endpoint                           | Stable behavior                     | CORE-1a change                                                             |
| ---------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/projects`                | Returns the current user's projects | Requires an authenticated session; unauthenticated calls return `401`.     |
| `POST /api/projects`               | Creates a project for the caller    | Owner comes only from the authenticated session; no request/body fallback. |
| `GET/PUT/DELETE /api/projects/:id` | Operates on an owned project        | Always enforces ownership; browser patches are allow-listed.               |
| `POST /api/projects/:id/generate`  | Starts the existing generation path | Uses the authenticated user instead of caller-supplied/default `userId`.   |

The standalone `Frontend` repository already authenticates with httpOnly cookies and uses the existing `backendApi` normalization for these fields, so this compatible contract stabilization requires no duplicate frontend adapter or page.

## Explicitly Out of Scope

- Persistent blueprints, blueprint versions, and execution artifacts.
- Persistent chat conversations and messages.
- Removing the temporary blueprint/studio fallback artifacts; this requires an explicit generated-artifact lifecycle in CORE-1b/STUDIO-1.
- Workspace redesign, Studio plugin protocol changes, or legacy frontend deletion.

## Validation

- Clean Node.js 22 / npm 10 `npm run ci`: 62 test files / 709 tests passed.
- Project-runtime tests cover session requirement and cross-user denial.
- HTTP smoke flow passed: register owner and second user → create project → owner list → second user receives `403` → anonymous list receives `401`.
- PostgreSQL startup is fail-fast when configuration is incomplete; full restart durability against a running PostgreSQL service remains a CORE-1b acceptance test.

## Rollback

Revert this focused change set to return to the previous in-memory-only route wiring. Existing PostgreSQL records stay isolated in `kv_store` and can be reused when the change is re-applied.

## Next Objective — CORE-1b

Persist blueprint, version, execution, and chat records through the same provider; remove production fallback blueprints only when project creation has an explicit, real artifact lifecycle. Then add restart and cross-user end-to-end coverage.
