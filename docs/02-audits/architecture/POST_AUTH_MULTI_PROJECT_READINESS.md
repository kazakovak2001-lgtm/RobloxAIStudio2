# Post-Auth Multi-Project Readiness Assessment

**Date**: July 15, 2026  
**Status**: COMPLETE

---

## Key Finding

**Two separate project systems exist in the backend:**

| System                    | Location                        | Features                              | Currently Used?                  |
| ------------------------- | ------------------------------- | ------------------------------------- | -------------------------------- |
| InMemoryProjectRepository | server/src/projects/repository/ | CRUD, no ownership                    | ✅ YES — /api/projects uses this |
| SaaSProjectRepository     | server/src/platform/projects/   | CRUD + ownership + per-user isolation | ❌ NOT wired to any route        |

**F-9 (Multi-Project) requires switching from the simple `InMemoryProjectRepository` to the `SaaSProjectRepository` which has ownership.**

---

## 1. Multi-Project Backend Readiness

### SaaSProjectRepository ✅ (Exists, untapped)

- `create(ownerId, name, genre)` — creates project with owner
- `getByOwner(ownerId)` — lists projects for a specific user
- `verifyOwnership(projectId, userId)` — authorization check
- `duplicate(projectId, newOwnerId?)` — copy project
- Uses `StorageProvider` interface (works with InMemory OR Postgres)

### Current /api/projects route ❌ (No ownership)

- Uses `InMemoryProjectRepository` which has NO `ownerId` field
- `listProjects()` returns ALL projects (no user filtering)
- No auth token checked on project routes

### Gap

To enable F-9, the `/api/projects` route must be **switched** to use `SaaSProjectRepository` and the authenticated user's ID from the auth token.

---

## 2. Storage Dependency

**F-9 works fine with InMemory storage.** The `SaaSProjectRepository` takes a `StorageProvider` parameter — it uses whatever is configured (InMemory by default). PostgreSQL is NOT required.

F-11 would add persistence but is NOT a blocker for F-9.

---

## 3. Frontend Readiness

| Area             | Current                 | After F-9                    |
| ---------------- | ----------------------- | ---------------------------- |
| ProjectsPage     | Lists ALL projects      | Lists only user's projects   |
| Project creation | No owner assigned       | Owner = authenticated user   |
| Workspace        | Opens any project by ID | Verifies ownership           |
| Auth integration | AuthContext has user ID | Pass user ID to project APIs |

**Required frontend changes**:

- Include auth token in project API calls (Authorization header)
- Projects list automatically filtered by backend (no frontend filtering needed)
- No routing changes required (same URLs)

---

## 4. Recommended Order

### **Option A: F-9 first** ✅ RECOMMENDED

```
F-10 Auth ✅ (done)
    ↓
F-9 Multi-Project (wire SaaSProjectRepository + auth headers)
    ↓
F-11 PostgreSQL (add persistence when ready to deploy)
    ↓
F-12 Collaborative
```

**Evidence**:

1. SaaSProjectRepository works with InMemory — no Postgres needed
2. Auth is already implemented — user ID available
3. Frontend change is minimal (add auth header to projectService)
4. F-11 (Postgres) is independent and can happen anytime
5. F-9 provides immediate user-facing value (project isolation)

### Why NOT Option B (F-11 first)?

F-11 requires installing `pg`, rewriting PostgresStorageProvider, creating migration runner — significant backend work with zero user-facing value until a production deployment target exists. F-9 delivers per-user project isolation with minimal effort.

---

## 5. Implementation Complexity

| Task                                             | Effort  | Risk                           |
| ------------------------------------------------ | ------- | ------------------------------ |
| Switch projects route to SaaSProjectRepository   | 1h      | LOW (both use StorageProvider) |
| Add auth token extraction to project routes      | 30min   | LOW                            |
| Update frontend projectService with auth headers | 30min   | LOW                            |
| Test ownership isolation                         | 30min   | LOW                            |
| **Total F-9**                                    | **~3h** | **LOW**                        |

Compare with F-11:

| Task                                       | Effort  | Risk       |
| ------------------------------------------ | ------- | ---------- |
| Install pg + @types/pg                     | 5min    | LOW        |
| Rewrite PostgresStorageProvider (real SQL) | 3h      | MEDIUM     |
| Create migration runner                    | 1h      | MEDIUM     |
| Docker Compose setup                       | 30min   | LOW        |
| Verify all existing features still work    | 1h      | MEDIUM     |
| **Total F-11**                             | **~6h** | **MEDIUM** |

---

## Decision

### **A) Implement F-9 Multi-Project now** ✅

F-9 is lower effort (3h vs 6h), lower risk (LOW vs MEDIUM), provides immediate user value, and has no dependency on F-11. Auth is already in place. SaaSProjectRepository is tested and ready.
