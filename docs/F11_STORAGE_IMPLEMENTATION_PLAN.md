# F-11 Persistent Storage Implementation Plan

**Date**: July 15, 2026  
**Approach**: JSONB Key-Value Table  
**Effort**: ~3.5 hours

---

## Strategy

Replace the in-memory Map in `PostgresStorageProvider` with real PostgreSQL queries using a single JSONB table. This preserves the existing `StorageProvider` interface exactly — no other code needs to change.

---

## Files to Create/Modify

| File                                                            | Action                                      |
| --------------------------------------------------------------- | ------------------------------------------- |
| package.json                                                    | ADD `pg` + `@types/pg` dependencies         |
| docker-compose.yml                                              | CREATE — PostgreSQL service definition      |
| .env.example                                                    | UPDATE — add DATABASE_URL, STORAGE_PROVIDER |
| server/src/platform/storage/postgres/PostgresStorageProvider.ts | REWRITE — real pg Pool                      |
| server/src/platform/storage/postgres/MigrationRunner.ts         | CREATE — auto-run migrations                |
| server/src/platform/storage/postgres/migrations.ts              | SIMPLIFY — add kv_store table               |

---

## PostgresStorageProvider Rewrite

Core logic:

```typescript
import { Pool } from "pg";

class PostgresStorageProvider implements StorageProvider {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  async get<T>(collection: string, id: string): T | null {
    const { rows } = await this.pool.query(
      "SELECT data FROM kv_store WHERE collection=$1 AND id=$2",
      [collection, id],
    );
    return rows[0]?.data ?? null;
  }

  async set<T>(collection: string, id: string, data: T): void {
    await this.pool.query(
      `INSERT INTO kv_store (collection, id, data) VALUES ($1, $2, $3)
       ON CONFLICT (collection, id) DO UPDATE SET data=$3, updated_at=NOW()`,
      [collection, id, JSON.stringify(data)],
    );
  }
  // ... delete, list, count similarly
}
```

---

## Interface Change Note

⚠️ The current `StorageProvider` interface is **synchronous**. PostgreSQL requires **async**.

Options:

- A) Make interface async (breaking change — all consumers need update)
- B) Use synchronous pg client (not recommended)
- C) Use pre-loaded cache with write-through (current pattern — keep it)

**Decision**: Keep Option C (cache with write-through). Load all data on startup, serve reads from cache, write-through to pg on mutations. This preserves the sync interface while adding persistence.

---

## Definition of Done

- [ ] `pg` installed
- [ ] docker-compose.yml created
- [ ] PostgresStorageProvider uses real pg connection
- [ ] Data persists across server restarts
- [ ] `STORAGE_PROVIDER=inmemory` still works (default)
- [ ] Health check returns real db status
- [ ] Build passes
- [ ] Existing tests pass
