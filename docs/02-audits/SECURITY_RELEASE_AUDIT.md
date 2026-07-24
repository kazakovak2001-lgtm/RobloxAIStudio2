# Security Release Audit

**Date**: July 15, 2026  
**Type**: Pre-Release Security Assessment  
**Status**: AUDIT COMPLETE  
**Overall Security Score**: 7.0/10 (Functional — Hardening Required Before Public Deployment)

---

## Executive Summary

The application has a working security foundation with rate limiting, CORS, helmet headers, JWT-like authentication, and project ownership isolation. However, several critical items must be addressed before exposing this to public internet traffic:

1. **Password hashing uses unsalted SHA-256** — trivially crackable
2. **Tokens stored in localStorage** — XSS attack vector
3. **Auth middleware bypassed in development** — must enforce in production
4. **Socket.IO auth is superficial** — token presence only, no validation
5. **Dependency vulnerabilities** — esbuild/vite moderate-to-high severity

---

## 1. Authentication Flow

### Current Implementation

| Component        | Status     | Notes                                        |
| ---------------- | ---------- | -------------------------------------------- |
| Registration     | ✅ Working | POST /api/platform/auth/register             |
| Login            | ✅ Working | POST /api/platform/auth/login                |
| Logout           | ✅ Working | POST /api/platform/auth/logout               |
| Token Refresh    | ✅ Working | POST /api/platform/auth/refresh (7d window)  |
| Session Validate | ✅ Working | GET /api/platform/auth/me                    |
| Token Expiry     | ✅ 24h     | Auto-cleanup on expired access               |
| Roles            | ✅ Present | creator, admin, guest roles with permissions |

### Issues Found

#### CRITICAL: Password Hashing (SHA-256 without salt)

```typescript
// AuthService.ts line 109
private hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
```

**Risk**: HIGH  
**Impact**: If database is compromised, all passwords are crackable via rainbow tables in seconds.  
**Fix**: Replace with `bcrypt` (cost factor 12). Install `bcrypt` + `@types/bcrypt`.  
**Effort**: 1 hour

#### HIGH: Token Storage (localStorage)

```typescript
// authApi.ts
localStorage.setItem(TOKEN_KEY, token);
localStorage.setItem(REFRESH_KEY, refreshToken);
```

**Risk**: HIGH for public deployment  
**Impact**: Any XSS vulnerability gives attacker full access to stored tokens.  
**Fix**: Move to httpOnly, Secure, SameSite=Strict cookies set by server.  
**Effort**: 2 hours (server sets cookies + frontend removes localStorage logic)

#### MEDIUM: Token Validation is Presence-Only

```typescript
// security.ts — authMiddleware in production
if (authHeader?.startsWith("Bearer ")) {
  // JWT/token validation would go here in production
  // For now, presence of valid-format token is sufficient
  next();
  return;
}
```

**Risk**: MEDIUM  
**Impact**: Any string starting with "Bearer " passes auth. No cryptographic verification.  
**Fix**: Call `AuthService.validateToken()` from middleware. Extract user identity and attach to `req`.  
**Effort**: 1 hour

---

## 2. Authorization & Access Control

### Route Protection

| Category         | Routes                      | Auth Required       | Status                         |
| ---------------- | --------------------------- | ------------------- | ------------------------------ |
| Health           | /health                     | No                  | ✅ Correct                     |
| System           | /api/system/*               | No                  | ✅ Public discovery            |
| Platform Users   | POST /api/platform/users    | No (registration)   | ✅ Correct                     |
| Auth             | /api/platform/auth/* (POST) | No (login/register) | ✅ Correct                     |
| Projects         | /api/projects/*             | YES                 | ⚠️ Only enforced in production |
| AI/Generation    | /api/lua/_, /api/generate/_ | YES                 | ⚠️ Only enforced in production |
| All other routes | /api/*                      | YES                 | ⚠️ Only enforced in production |

### Auth Middleware Bypass in Development

```typescript
// security.ts line 87
if (process.env.NODE_ENV !== "production") {
  next();
  return;
}
```

**Risk**: MEDIUM  
**Impact**: Entire auth layer is invisible during development/testing. Bugs in auth logic may not be caught until production.  
**Recommendation**: Add a `SKIP_AUTH=true` flag instead of blanket dev bypass, or enforce auth in dev with a test user auto-login.

### Project Ownership Isolation

- ✅ `SaaSProjectRepository` enforces `ownerId` on all operations
- ✅ Frontend sends Authorization header on every project request
- ✅ GET returns only user's projects
- ✅ UPDATE/DELETE verify ownership before mutation

---

## 3. API Key Authentication

```typescript
if (apiKey && apiKeyStore.validate(apiKey)) {
  // Registered API key authentication (Studio plugin, CI/CD)
  next();
  return;
}
```

**Status**: ✅ RESOLVED  
**Implementation**: `ApiKeyStore` stores SHA-256 digests only, supports revocation and
`API_KEYS` bootstrap seeding, and uses the configured `StorageProvider`. Production
PostgreSQL deployments persist the registry through the provider's write-through key-value
store; unknown, short, or array-valued `X-API-Key` headers receive `401`.

---

## 4. Socket.IO Security

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  if (!token) {
    next(new Error("Authentication required"));
    return;
  }
  // Token present — allow connection
  next();
});
```

**Risk**: MEDIUM  
**Impact**: In production, any non-empty token passes. Attacker can connect to any project room.  
**Fix**: Validate token via `AuthService.validateToken()`, extract userId, restrict room joins to owned projects.  
**Effort**: 2 hours

---

## 5. Rate Limiting

```typescript
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 req/min per IP
});
```

**Status**: ✅ Adequate for initial release  
**Note**: Consider separate limits for auth endpoints (5-10 attempts/min) to prevent brute force.  
**Recommendation**: Add stricter rate limit on `/api/platform/auth/login` (10 req/min).

---

## 6. CORS Configuration

**Development**: All origins allowed (`*`)  
**Production**: Whitelist of localhost variants + `FRONTEND_URL` env var

**Status**: ✅ Correct pattern  
**Note**: Requests without `origin` header are allowed (server-to-server, curl). This is acceptable for API servers.

---

## 7. Security Headers (Helmet)

```typescript
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});
```

**Status**: ✅ Functional  
**Note**: CSP disabled because backend doesn't serve HTML. If backend ever serves the SPA, enable CSP.

---

## 8. Input Validation

| Endpoint           | Validation                            | Status |
| ------------------ | ------------------------------------- | ------ |
| /auth/register     | email, password, displayName required | ✅     |
| /auth/login        | email, password required              | ✅     |
| /auth/refresh      | refreshToken required                 | ✅     |
| /projects (create) | Basic body validation                 | ✅     |
| /api/lua/generate  | prompt required                       | ✅     |
| General            | No schema validation library          | ⚠️     |

**Risk**: LOW-MEDIUM  
**Impact**: No `zod` or `joi` for runtime schema enforcement. Malformed payloads may cause unexpected behavior.  
**Recommendation**: Add `zod` for critical endpoints (auth, projects) as a future improvement.

---

## 9. Dependency Vulnerabilities

### npm audit (frontend)

```
esbuild  <=0.24.2 — MODERATE (GHSA-67mh-4wv8-2f99)
vite     <=6.4.2  — HIGH (depends on vulnerable esbuild)
```

**Impact**: Development server only. Does NOT affect production builds.  
**Fix**: Upgrade vite to ^6.5+ or ^8.x when ready.  
**Urgency**: LOW (dev-only vulnerability)

### npm audit (server)

```
esbuild  <=0.24.2 — MODERATE
vite     <=6.4.2  — HIGH
```

Same vulnerability, same assessment: dev-only, no production impact.

### Missing Dependencies

- `bcrypt` — Not installed (needed for password hardening)
- No known typosquatting risks in current dependencies

---

## 10. Data Exposure

| Risk                 | Area                                            | Status   |
| -------------------- | ----------------------------------------------- | -------- |
| Password in response | Never returned                                  | ✅       |
| Token in URL         | Not used (header-based)                         | ✅       |
| Error stack traces   | Not exposed to client                           | ✅       |
| User enumeration     | Login returns same error for bad email/password | ✅       |
| Registration enum    | Returns 409 for existing email                  | ⚠️ Minor |

**Note**: Registration endpoint reveals whether an email is already registered (HTTP 409). This is a minor information disclosure — acceptable for most apps.

---

## 11. Database Security

| Item                  | Status | Notes                                                    |
| --------------------- | ------ | -------------------------------------------------------- |
| Parameterized queries | ✅     | PostgresStorageProvider uses `$1, $2` params             |
| Connection pooling    | ✅     | pg Pool with max 20 connections                          |
| Credentials in env    | ✅     | DATABASE_URL from environment                            |
| Default password      | ⚠️     | docker-compose uses `studio_dev` — change for production |
| SSL connection        | ❌     | Not configured — required for remote databases           |

---

## 12. Summary of Findings

### MUST FIX Before Public Deployment (HIGH)

| #   | Finding                                             | Effort | Impact                                 |
| --- | --------------------------------------------------- | ------ | -------------------------------------- |
| 1   | Replace SHA-256 with bcrypt for passwords           | 1h     | Prevents password cracking             |
| 2   | Move tokens to httpOnly cookies                     | 2h     | Eliminates XSS token theft             |
| 3   | Validate tokens cryptographically in authMiddleware | 1h     | Prevents bypass with arbitrary strings |
| 4   | Validate API keys against stored keys               | ✅ Done | Prevents bypass via X-API-Key header   |
| 5   | Validate Socket.IO tokens properly                  | 1h     | Prevents unauthorized real-time access |

### SHOULD FIX Before Scale (MEDIUM)

| #   | Finding                                    | Effort | Impact                              |
| --- | ------------------------------------------ | ------ | ----------------------------------- |
| 6   | Stricter rate limit on login endpoint      | 30min  | Prevents brute force                |
| 7   | Add request schema validation (zod)        | 3h     | Defense in depth                    |
| 8   | Configure SSL for remote Postgres          | 30min  | Prevents data interception          |
| 9   | Change default docker-compose password     | 5min   | Prevents default credential attacks |
| 10  | Consider removing dev auth bypass entirely | 1h     | Catches auth bugs earlier           |

### ACCEPTABLE FOR v1.0 (LOW)

| #   | Finding                           | Status                         |
| --- | --------------------------------- | ------------------------------ |
| 11  | Vite/esbuild vulnerability        | Dev-only, no production impact |
| 12  | Email enumeration on registration | Standard UX tradeoff           |
| 13  | No external monitoring/alerting   | Acceptable for launch          |
| 14  | Missing JSDoc on auth functions   | Documentation debt             |

---

## 13. Hardening Roadmap

### Phase 1: Pre-Deploy (4-5 hours total)

1. Install bcrypt, replace SHA-256 hash → **1h**
2. Implement httpOnly cookie token flow → **2h**
3. Wire AuthService.validateToken() into authMiddleware → **1h**
4. Add login rate limit (10/min) → **30min**

### Phase 2: Post-Launch Stabilization (5-6 hours)

5. API key validation store → **2h**
6. Socket.IO token validation + room access control → **2h**
7. Add zod schemas to auth endpoints → **1.5h**

### Phase 3: Production Hardening

8. External monitoring (uptime, error rates) → **2h**
9. Log aggregation (structured JSON → external service) → **2h**
10. Penetration testing → **External engagement**

---

## 14. Conclusion

The security implementation is **functional and well-structured** for an initial product release to a controlled user base (beta, internal). The main risks are concentrated in credential handling (SHA-256, localStorage) and token validation shortcuts that were acceptable during development but must be hardened before public internet exposure.

**Recommendation**: Execute Phase 1 hardening (4-5 hours) before any public deployment. The application is safe for demo environments and controlled beta access in its current state.
