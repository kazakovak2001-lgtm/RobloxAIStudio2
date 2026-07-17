# F-11 Storage Implementation Audit

**Date**: July 15, 2026  
**Status**: COMPLETE

---

## Key Architecture Insight

The `StorageProvider` interface is a **generic key-value store**, not a traditional ORM with per-entity repositories:

```typescript
get<T>(collection: string, id: string): T | null
set<T>(collection: string, id: string, data: T): void
delete(collection: string, id: string): boolean
list<T>(collection: string, filter?: (item: T) => boolean): T[]
count(collection: string): number
```

This means the PostgreSQL implementation needs a **single JSONB table** (or per-collection tables with JSONB data column) — NOT schema-per-entity.

---

## Implementation Options

### Option 1: JSONB Key-Value Table (Simplest — ~3h)

```sql
CREATE TABLE kv_store (
  collection VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (collection, id)
);
CREATE INDEX idx_kv_collection ON kv_store(collection);
```

Maps directly to the StorageProvider interface:

- `get(collection, id)` → `SELECT data FROM kv_store WHERE collection=$1 AND id=$2`
- `set(collection, id, data)` → `INSERT ... ON CONFLICT (collection, id) DO UPDATE SET data=$3`
- `delete(collection, id)` → `DELETE FROM kv_store WHERE collection=$1 AND id=$2`
- `list(collection)` → `SELECT data FROM kv_store WHERE collection=$1`
- `count(collection)` → `SELECT COUNT(*) FROM kv_store WHERE collection=$1`

**Pros**: Minimal code, keeps existing interface, no schema changes needed
**Cons**: Filter function can't be pushed to DB (loaded in memory then filtered), no typed columns

### Option 2: Per-Entity Schema (More work — matches existing migrations)

Use the 6 existing migrations (users, projects, sessions, jobs, usage, audit) with dedicated SQL per entity.

**Pros**: Proper indexing, typed queries, efficient filtering
**Cons**: Breaks StorageProvider generic interface (need per-entity repositories), much more code

---

## Recommendation: Option 1 (JSONB Key-Value)

**Reasoning**:

- Preserves the existing `StorageProvider` interface perfectly
- ALL existing code (SaaSProjectRepository, AuthService, etc.) continues working unchanged
- Only 1 file needs rewriting (PostgresStorageProvider.ts)
- Only 1 migration needed (the kv_store table)
- Filter function limitation is acceptable for current data volume (<1000 items per collection)

---

## Implementation Roadmap

| Step      | Task                                                       | Effort    |
| --------- | ---------------------------------------------------------- | --------- |
| 1         | Install `pg` + `@types/pg`                                 | 5 min     |
| 2         | Create `docker-compose.yml` with PostgreSQL                | 15 min    |
| 3         | Rewrite PostgresStorageProvider with real pg Pool + SQL    | 2h        |
| 4         | Create simple migration runner (auto-run on first connect) | 30 min    |
| 5         | Test with `STORAGE_PROVIDER=postgres` + Docker             | 30 min    |
| 6         | Documentation                                              | 15 min    |
| **Total** |                                                            | **~3.5h** |

---

## Environment Setup

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: roblox_ai_studio
      POSTGRES_USER: studio
      POSTGRES_PASSWORD: studio_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

```bash
# .env additions
STORAGE_PROVIDER=postgres
DATABASE_URL=postgresql://studio:studio_dev@localhost:5432/roblox_ai_studio
```

---

## Testing Strategy

- Existing persistence test (`server/src/__tests__/persistence.test.ts`) already tests both providers
- Run with `STORAGE_PROVIDER=postgres` to verify
- Health check endpoint (`/health/database`) already exists

---

## Migration Strategy

- **Development**: InMemory (default) — no Docker needed
- **Staging/Production**: PostgreSQL via `STORAGE_PROVIDER=postgres`
- **No data migration needed**: InMemory data is ephemeral (lost on restart anyway)
- **Rollback**: Set `STORAGE_PROVIDER=inmemory` to revert

---

## Final Recommendation

### **A) Implement F-11 now** ✅ using Option 1 (JSONB Key-Value)

This is the last feature that can be implemented quickly (~3.5h). It completes the persistence layer without breaking any existing code. Only 1 backend file needs rewriting + 1 Docker config file.

After F-11, only F-12 (Collaborative) remains — which is experimental and requires 3+ sprints of fundamentally new architecture.
