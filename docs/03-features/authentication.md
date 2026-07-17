# Authentication Feature

**Date**: July 15, 2026  
**Feature**: F-10 (Real Authentication)  
**Status**: COMPLETE ✅

---

## Summary

| Metric                  | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| Backend files modified  | 1 (platform.ts — added auth routes)                  |
| Frontend files created  | 2 (authApi.ts, tests)                                |
| Frontend files modified | 2 (AuthContext.tsx, LoginPage.tsx, RegisterPage.tsx) |
| Backend endpoints added | 5                                                    |
| Tests                   | 6 pass                                               |
| Build                   | PASS                                                 |

---

## Backend Endpoints (NEW — added to /api/platform)

| Endpoint                    | Method | Purpose                          |
| --------------------------- | ------ | -------------------------------- |
| /api/platform/auth/register | POST   | Create account + auto-login      |
| /api/platform/auth/login    | POST   | Authenticate with email/password |
| /api/platform/auth/logout   | POST   | Invalidate token                 |
| /api/platform/auth/refresh  | POST   | Rotate token pair                |
| /api/platform/auth/me       | GET    | Get current user from token      |

---

## Frontend Auth Flow

```
App Mount → Check localStorage token → GET /auth/me → Restore session OR clear
Login → POST /auth/login → Store tokens → Set user
Register → POST /auth/register → Store tokens → Set user
Logout → POST /auth/logout → Clear tokens → Set user = null
```

---

## Token Strategy

- Access token: stored in `localStorage` as `roblox_ai_token`
- Refresh token: stored as `roblox_ai_refresh`
- Token format: `tok_` + SHA256(UUID) (24h expiry)
- Refresh window: 7 days

---

## Limitations (Known)

- No protected route enforcement yet (all routes accessible without auth)
- Password uses SHA-256 without salt (functional, upgrade to bcrypt for production)
- Tokens stored in localStorage (XSS risk in production — use httpOnly cookies)
- InMemory storage (users lost on restart until F-11)

---

## Next: Add Protected Route Wrapper (future enhancement)

When needed, add `<PrivateRoute>` component that checks `isAuthenticated` and redirects to `/login`.
