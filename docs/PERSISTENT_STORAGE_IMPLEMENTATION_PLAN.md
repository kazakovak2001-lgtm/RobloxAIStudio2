# Persistent Storage Implementation Plan

**Date**: July 15, 2026  
**Task**: F-11 (Persistent Storage)  
**Status**: PRE-AUDIT COMPLETE — Decision required

---

## Current State

- `PostgresStorageProvider` exists but uses in-memory Map (not real PostgreSQL)
- Migrations SQL is defined (6 tables) but no runner exists
- `pg` package is NOT installed
- StorageFactory correctly routes based on env var
- All code uses the StorageProvider interface (clean abstraction)

---

## If Implementing (Option C)

### Files to Create/Modify

| File                                                            | Action                       |
| --------------------------------------------------------------- | ---------------------------- |
| package.json                                                    | ADD `pg` + `@types/pg`       |
| docker-compose.yml                                              | CREATE — PostgreSQL service  |
| server/src/platform/storage/postgres/PostgresStorageProvider.ts | REWRITE — real pg Pool       |
| server/src/platform/storage/postgres/MigrationRunner.ts         | CREATE — auto-run migrations |
| .env.example                                                    | UPDATE — add DATABASE_URL    |

### Effort: ~6 hours

### Validation

- All existing tests pass with `STORAGE_PROVIDER=postgres`
- Data persists across server restarts
- Frontend unchanged (no frontend code changes)

---

## If Deferring (Option B)

No code changes. Document decision. Move to F-10 (Auth) which provides more immediate user-facing value.

---

## Awaiting Decision

This is NOT a pure "wire frontend to existing backend" task like F-1 through F-8. It requires npm package installation and real implementation work on the backend. The user should decide whether to proceed or defer.
