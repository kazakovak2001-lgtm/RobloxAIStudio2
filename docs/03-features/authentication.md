# Authentication Feature

**Date**: July 28, 2026
**Feature**: F-10 (Real Authentication)  
**Status**: HARDEN-2A / SEC-201 COMPLETE

---

## Summary

Production authentication uses random opaque access and refresh credentials
backed by the configured storage provider. Browser JavaScript receives the
authenticated user and role, never reusable credentials. The credentials are
delivered through scoped httpOnly cookies and validated against server-side
session state for REST and Socket.IO.

---

## Backend endpoints

| Endpoint                             | Method | Purpose                                   |
| ------------------------------------ | ------ | ----------------------------------------- |
| `/api/platform/auth/register`        | POST   | Create account and issue cookie session   |
| `/api/platform/auth/login`           | POST   | Authenticate and issue cookie session     |
| `/api/platform/auth/logout`          | POST   | Invalidate access session, clear cookies  |
| `/api/platform/auth/refresh`         | POST   | Consume and rotate refresh credential     |
| `/api/platform/auth/me`              | GET    | Resolve the current cookie/Bearer session |
| `/api/platform/auth/forgot-password` | POST   | Accept a recovery request                 |

---

## Frontend Auth Flow

```text
App mount → credentialed GET /auth/me → restore user or remain signed out
Login/register → server sets httpOnly cookies → response returns user only
401 from protected API → one cookie refresh → retry the original request
Logout → server invalidates session and clears cookies → clear cached user
```

---

## Credential contract

| Property             | Access credential                        | Refresh credential                                 |
| -------------------- | ---------------------------------------- | -------------------------------------------------- |
| Browser delivery     | `roblox_ai_token` httpOnly cookie        | `roblox_ai_refresh` httpOnly cookie                |
| Cookie path          | `/` (covers REST and `/socket.io`)       | `/api/platform/auth/refresh`                       |
| Production policy    | `Secure`, `SameSite=Lax`, host-only      | `Secure`, `SameSite=Lax`, host-only                |
| Lifetime             | 24 hours                                 | 7 days                                             |
| Persistence          | Session record keyed by opaque token     | SHA-256 digest only; plaintext is never persisted  |
| Rotation             | Old access session is invalidated        | Single-use: old credential fails after replacement |
| Non-browser clients  | Explicit Bearer token remains supported  | Body input remains a compatibility fallback        |
| Response-body policy | Never returned by register/login/refresh | Never returned by register/login/refresh           |

The credentials are not signed tokens and require no signing secret. Existing
pre-HARDEN-2A plaintext refresh records are converted to digests after durable
storage hydration and flushed before the server begins accepting traffic.

## Compatibility and evidence

- bcrypt password hashing remains at cost factor 12.
- `/auth/me`, logout, Bearer clients, API-key clients, and production Socket.IO
  cookie authentication retain their existing contracts.
- The canonical Frontend already sends `credentials: "include"` and reads only
  the returned user from login/register responses.
- Native HARDEN-2A tests prove credential-free bodies, cookie attributes,
  digest-only persistence, legacy migration, successful rotation, and replay
  rejection.
- The composed HTTPS release verifier exercises register, login, refresh,
  `/auth/me`, unauthenticated Socket.IO rejection, authenticated Socket.IO
  upgrade, and old-refresh replay rejection in production mode.

Route-level role/permission middleware is a separate `SEC-202` item; project
ownership and authenticated-user enforcement remain active independently.
