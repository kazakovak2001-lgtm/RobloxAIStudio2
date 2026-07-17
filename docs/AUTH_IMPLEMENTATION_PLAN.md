# Authentication Implementation Plan

**Date**: July 15, 2026  
**Task**: F-10 (Real Authentication)  
**Status**: PRE-AUDIT COMPLETE — Ready to implement

---

## Architecture Decision: Implement Auth BEFORE Storage

Auth backend is fully functional in-memory. No PostgreSQL dependency. Provides immediate user-facing value.

**Revised order**: F-10 → F-11 → F-9 → F-12

---

## Backend API (To verify — check /api/platform routes)

Expected endpoints (based on AuthService methods):

- POST /api/platform/auth/register — create account
- POST /api/platform/auth/login — authenticate
- POST /api/platform/auth/logout — invalidate session
- POST /api/platform/auth/refresh — refresh token
- GET /api/platform/auth/me — get current user

---

## Frontend Implementation

### Files to Create

| File                               | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| src/services/authApi.ts            | API client (register, login, logout, refresh, getMe) |
| src/app/providers/AuthProvider.tsx | New context with real API + token storage            |

### Files to Modify

| File                          | Change                                           |
| ----------------------------- | ------------------------------------------------ |
| src/providers/AuthContext.tsx | REWRITE — real auth                              |
| src/pages/LoginPage.tsx       | Call authApi.login()                             |
| src/pages/RegisterPage.tsx    | Call authApi.register()                          |
| src/services/api.ts           | Add auth header interceptor                      |
| src/app/router/index.tsx      | Add PrivateRoute wrapper for authenticated pages |

### Token Storage Strategy

```
Login → Store token in localStorage →
Include in all fetch headers →
On 401 → Try refresh →
On refresh fail → Redirect to /login
```

---

## Definition of Done

- [ ] authApi.ts created (5 functions)
- [ ] AuthContext uses real API
- [ ] Token stored in localStorage
- [ ] All API calls include Authorization header
- [ ] Login/Register call real endpoints
- [ ] Protected routes redirect to /login when unauthenticated
- [ ] Logout clears token + session
- [ ] Tests pass
- [ ] TypeScript PASS
- [ ] Vite PASS
