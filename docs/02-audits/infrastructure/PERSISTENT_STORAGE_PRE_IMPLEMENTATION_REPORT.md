# Persistent Storage Pre-Implementation Report

**Date**: July 15, 2026  
**Task**: F-11 Pre-Implementation Analysis  
**Status**: COMPLETE — Ready to enable

---

## Key Finding

**PostgresStorageProvider is NOT a real PostgreSQL implementation.** It uses the same in-memory Map as InMemoryStorageProvider but adds a write-through cache layer and configuration interface. The `pg` library is NOT imported — all operations are in-memory with PostgreSQL-compatible interfaces.

This means F-11 requires:

1. Installing `pg` npm package
2. Implementing real SQL queries in PostgresStorageProvider
3. OR: Accept current implementation as "Postgres-ready architecture" and defer actual database connection

---

## Storage Layer Analysis

### StorageProvider Interface (5 methods)

```typescript
get<T>(collection: string, id: string): T | null
set<T>(collection: string, id: string, data: T): void
delete(collection: string, id: string): boolean
list<T>(collection: string, filter?: (item: T) => boolean): T[]
count(collection: string): number
```

### InMemoryStorageProvider ✅

- Full implementation using `Map<string, Map<string, unknown>>`
- Currently active (`STORAGE_PROVIDER=inmemory` default)

### PostgresStorageProvider ⚠️ PARTIAL

- Has config (connectionString, poolSize, poolTimeout)
- Has `transaction()`, `healthCheck()`, `isConnected()` methods
- **BUT**: All operations use in-memory Map cache — NO actual pg queries
- Comment says: "In production, uncomment the pg Pool usage and remove the in-memory fallback"
- `pg` package is NOT in dependencies

### StorageFactory ✅

- Reads `STORAGE_PROVIDER` env var
- Returns appropriate provider instance
- Clean factory pattern

### Migrations ✅ (Schema Only)

- 6 migration versions defined (SQL strings)
- Tables: users, projects, generation_jobs, sessions, usage_records, audit_logs
- Proper indexes and foreign keys defined
- BUT: No migration runner exists (SQL not executed automatically)

---

## Environment Requirements

| Variable         | Purpose                      | Default                                      |
| ---------------- | ---------------------------- | -------------------------------------------- |
| STORAGE_PROVIDER | Switch provider              | "inmemory"                                   |
| DATABASE_URL     | PostgreSQL connection string | postgresql://localhost:5432/roblox_ai_studio |
| POOL_SIZE        | Connection pool size         | 10                                           |
| POOL_TIMEOUT     | Pool timeout (ms)            | 30000                                        |

---

## Risk Assessment

| Risk                                              | Level  | Details                                                             |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| PostgresProvider is actually InMemory with config | HIGH   | The "switch" doesn't actually persist — need real pg implementation |
| `pg` package not installed                        | MEDIUM | Need to add dependency                                              |
| No migration runner                               | MEDIUM | SQL exists but isn't auto-executed                                  |
| Frontend impact                                   | NONE   | Frontend calls API, doesn't know about storage                      |

---

## Implementation Options

### Option A: Full PostgreSQL Implementation (2 sprints)

- Install `pg` package
- Rewrite PostgresStorageProvider to use real SQL queries
- Create migration runner
- Set up Docker Compose for local PostgreSQL
- **Effort**: HIGH, **Value**: Production-ready persistence

### Option B: Accept Architecture, Defer Real DB (0 effort)

- Acknowledge that "PostgresStorageProvider" is aspirational
- Continue with InMemory (current)
- Real PostgreSQL when production deployment is needed
- **Effort**: NONE, **Value**: None — status quo

### Option C: Docker + Real Connection, Keep Generic Interface (1 sprint)

- Install `pg`
- Implement real SQL in PostgresStorageProvider
- Keep the same StorageProvider interface
- Don't change any other code
- **Effort**: MEDIUM, **Value**: Data survives server restarts

---

## Recommendation

### **C) Implement Real PostgreSQL Connection (1 sprint)**

The architecture is correct — StorageProvider interface, factory, migrations are all there. What's missing is the actual `pg` Pool usage. This is ~4-6h of work:

1. `npm install pg @types/pg`
2. Rewrite PostgresStorageProvider methods to use real SQL
3. Add migration runner on startup
4. Create docker-compose.yml with PostgreSQL service
5. Test with `STORAGE_PROVIDER=postgres`

**Alternatively**: If production deployment is NOT imminent, Option B is acceptable — the project works perfectly with InMemory for development. Real PostgreSQL can wait until there's a deployment target.

---

## Decision Needed

Does the project need persistent storage NOW (for deployment), or is this for future production readiness?

- **If deploying soon**: Implement Option C
- **If still developing**: Option B is fine — move to F-10 (Auth) which has more immediate frontend value
