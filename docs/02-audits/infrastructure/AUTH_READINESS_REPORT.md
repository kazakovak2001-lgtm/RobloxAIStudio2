# Authentication Readiness Report

**Date**: July 15, 2026  
**Task**: F-10 Pre-Implementation Analysis  
**Status**: COMPLETE

---

## Key Finding

**AuthService IS fully functional — but uses in-memory Maps (same as storage).**

Unlike the PostgresStorageProvider which was just a placeholder, the AuthService has REAL logic:

- ✅ Registration with SHA-256 password hashing
- ✅ Login with credential verification
- ✅ Token generation (random UUIDs, not JWT — but functional)
- ✅ Token validation with expiration (24h)
- ✅ Refresh tokens (7-day window)
- ✅ Session management with TTL + last activity tracking
- ✅ Role-based permissions (5 roles × 7 permissions)
- ✅ Logout (session invalidation)
- ✅ Revoke all sessions for a user

**The auth system WORKS in-memory without PostgreSQL.** F-10 can be implemented BEFORE F-11.

---

## Authentication Backend — Detailed Assessment

### Token System ✅

| Feature             | Implementation              | Notes                               |
| ------------------- | --------------------------- | ----------------------------------- |
| Token generation    | `tok_` + SHA256(UUID)       | Not JWT but functionally equivalent |
| Token validation    | Map lookup + expiry check   | Works                               |
| Token expiry        | 24 hours                    | Correct                             |
| Refresh tokens      | `ref_` + UUID, 7-day window | Works                               |
| Token revocation    | Map.delete()                | Works                               |
| Revoke all for user | Iterates + deletes          | Works                               |

### Session Management ✅

| Feature                 | Implementation         | Notes |
| ----------------------- | ---------------------- | ----- |
| Session creation        | UUID-based ID, 24h TTL | Works |
| Session validation      | Active check + expiry  | Works |
| Session invalidation    | Sets active=false      | Works |
| Invalidate all for user | Iterates sessions      | Works |
| Active session count    | Filter + count         | Works |
| Last activity tracking  | Updated on validate    | Works |

### Password Handling ✅

| Feature | Implementation | Notes                                        |
| ------- | -------------- | -------------------------------------------- |
| Hashing | SHA-256        | Functional (bcrypt preferred for production) |
| Salt    | ❌ NO salt     | Risk: rainbow tables possible                |
| Storage | In-memory Map  | Works for dev                                |

### Role & Permission System ✅

| Role          | Permissions                   |
| ------------- | ----------------------------- |
| guest         | (none)                        |
| creator       | create_project, generate_game |
| premium       | + delete_project, publish     |
| studio        | + manage_team                 |
| administrator | + manage_billing, admin       |

---

## Storage Dependency Analysis

**F-10 Auth does NOT require F-11 PostgreSQL.**

Auth works entirely with in-memory Maps:

- `credentials: Map<string, AuthCredentials>` — email → password hash
- `sessions: Map<string, AuthSession>` — token → session
- `userRoles: Map<string, UserRole>` — userId → role

**Limitation**: Data lost on restart. But for development this is identical to the current project storage behavior.

**Conclusion**: F-10 can be implemented independently. F-11 (PostgreSQL) adds persistence but is not a prerequisite.

---

## Frontend Changes Required

| Area             | Current         | After F-10                                   |
| ---------------- | --------------- | -------------------------------------------- |
| AuthContext      | setTimeout mock | Real API calls to /api/platform/auth/*       |
| Login            | Fake success    | POST /api/platform/auth/login                |
| Register         | Fake success    | POST /api/platform/auth/register             |
| Token storage    | None            | localStorage or cookie                       |
| API headers      | None            | Authorization: Bearer token                  |
| Protected routes | None            | Route guard wrapper                          |
| Logout           | setUser(null)   | POST /api/platform/auth/logout + clear token |

---

## Security Assessment

| Area                 | Status                     | Notes                                                     |
| -------------------- | -------------------------- | --------------------------------------------------------- |
| Password hashing     | ⚠️ SHA-256 without salt    | Functional but should upgrade to bcrypt                   |
| Token format         | Custom (not JWT)           | Works — no external verification needed for single-server |
| Token expiry         | ✅ 24h                     | Correct                                                   |
| Refresh mechanism    | ✅ 7-day                   | Correct                                                   |
| RBAC                 | ✅ 5 roles × 7 permissions | Well-designed                                             |
| Session invalidation | ✅                         | Correct                                                   |
| Middleware           | ✅ exists in security/     | Already in server but permissive in dev mode              |

---

## Recommendation

### **B) Implement F-10 (Auth) BEFORE F-11 (Storage)** ✅

**Evidence**:

1. Auth backend is FULLY FUNCTIONAL (unlike PostgresStorageProvider which is a shell)
2. Auth does NOT depend on PostgreSQL — works with in-memory Maps
3. Frontend auth is the biggest UX gap (placeholder login)
4. Implementing auth provides immediate user-facing value
5. Real auth enables F-9 (Multi-Project per user) without needing PostgreSQL
6. F-11 can be done later when production deployment is actually needed

**Implementation order change**: F-10 → F-11 → F-9 → F-12

---

## Effort Estimate

| Phase                                | Work                                         | Effort    |
| ------------------------------------ | -------------------------------------------- | --------- |
| Create authApi.ts (frontend service) | API client for login/register/logout/refresh | 30 min    |
| Rewrite AuthContext                  | Replace setTimeout with real API calls       | 2h        |
| Add token storage + headers          | localStorage + fetch interceptor             | 1h        |
| Add protected route wrapper          | PrivateRoute component                       | 30 min    |
| Wire Login/Register pages            | Call authApi instead of mock                 | 1h        |
| Tests                                | authApi tests                                | 30 min    |
| **Total**                            |                                              | **~5.5h** |
