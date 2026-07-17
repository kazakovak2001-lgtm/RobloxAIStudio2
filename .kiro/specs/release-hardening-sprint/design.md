# Release Hardening Sprint Bugfix Design

## Overview

The RobloxAiStudio-DevKit v1.0 candidate has 8 categories of security and deployment defects that block production release. This design formalizes each bug condition, specifies the expected correct behavior, hypothesizes root causes from code analysis, and outlines a targeted fix strategy. The goal is minimal, incremental changes that close security gaps and add deployment infrastructure without altering existing public API contracts or frontend behavior.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which the application behaves incorrectly — including auth route blocking, weak hashing, insecure storage, missing validation, superficial Socket.IO auth, dead code presence, stale documentation, and missing infrastructure
- **Property (P)**: The desired correct behavior for each bug condition — secure auth flow, proper hashing, httpOnly cookies, JWT validation, Socket.IO handshake validation, clean codebase, accurate docs, and deployment-ready infrastructure
- **Preservation**: Existing development-mode bypass, valid-token access, API response formats, Socket.IO dev connections, in-memory storage mode, passing tests, frontend routing, and security headers that must remain unchanged
- **`authMiddleware`**: The function in `server/src/common/middleware/security.ts` that gates access to protected routes based on `NODE_ENV` and token presence
- **`AuthService`**: The class in `server/src/platform/auth/AuthService.ts` that handles registration, login, token creation, and session management
- **`PUBLIC_PREFIXES`**: Array in `security.ts` that determines which route prefixes bypass authentication in production mode
- **`RealtimeServer`**: The class in `server/src/socket/index.ts` that manages Socket.IO connections without production token validation
- **`studioService.ts`**: Dead code frontend service hitting non-existent `/api/v1/studio` routes (correct endpoint is `/api/studio` in `studioBridgeApi.ts`)

## Bug Details

### Bug Condition

The bugs manifest across 8 categories when the application is deployed to production. The core condition is: the system is running with `NODE_ENV=production` and one or more of the following sub-conditions hold:

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type SystemState
  OUTPUT: boolean

  RETURN (input.env === "production" AND input.route.startsWith("/api/platform/auth") AND input.route NOT IN PUBLIC_PREFIXES)
         OR (input.action === "register" OR input.action === "login") AND hashAlgorithm === "sha256"
         OR (input.action === "storeToken" AND storageTarget === "localStorage")
         OR (input.hasAuthHeader AND input.env === "production" AND NOT cryptographicValidation(input.token))
         OR (input.isSocketConnection AND input.env === "production" AND NOT jwtValidation(input.socketToken))
         OR (input.action === "build" AND deadCodeExists(["AiEngineDemoPage", "src/hooks/", "src/utils/cn.ts", "src/types/index.ts", "studioService.ts"]))
         OR (input.action === "readDocs" AND docsContainStaleInfo())
         OR (input.action === "deploy" AND NOT infrastructureExists(["Dockerfile", "migrationRunner", "nginx.conf", "backup.sh"]))
END FUNCTION
```

### Examples

- **Auth Blocker**: User sends `POST /api/platform/auth/login` in production → receives 401 "Authentication required" instead of processing login
- **Weak Hashing**: User registers with password "MyP@ss123" → stored as unsalted SHA-256 hex `a3f2...` which is reversible via rainbow tables
- **Insecure Storage**: After login, token `tok_abc123` is written to `localStorage.setItem("roblox_ai_token", ...)` → accessible to any XSS script
- **Missing Validation**: Request with `Authorization: Bearer literally_anything` → passes authMiddleware and accesses protected resources
- **Socket.IO Bypass**: Client connects with `{auth: {token: "fake"}}` in production → connection accepted without calling `AuthService.validateToken()`
- **Dead Code**: `src/services/studioService.ts` calls `/api/v1/studio/status` which returns 404 (correct endpoint is `/api/studio/status`)
- **Stale Docs**: `CURRENT_STATE.md` says "Analytics: Hardcoded page" but Analytics is connected since Feature-1
- **No Infrastructure**: Running `docker build .` fails — no Dockerfile exists in the repository

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Development mode (`NODE_ENV !== "production"`) must continue to skip all authentication checks on all routes
- Valid-token access to protected `/api/*` routes must continue to work and return expected responses
- Frontend API calls to `/api/projects`, `/api/concept`, `/api/analytics`, and other existing endpoints must continue returning the same response format
- Socket.IO connections in development mode must continue without token validation
- In-memory storage mode (`STORAGE_PROVIDER=inmemory`) must continue to function without PostgreSQL
- All previously passing `vitest run` tests must continue to pass
- Frontend routing to `/ai-studio`, `/analytics`, `/knowledge`, `/settings`, and all other routed pages must render correctly after dead code removal
- Rate limiting, Helmet security headers, and CORS enforcement must remain identical

**Scope:**
All inputs that do NOT involve the 8 bug categories should be completely unaffected. This includes:

- Normal authenticated API usage with valid tokens in production
- All development-mode operations
- Mouse/keyboard UI interactions unrelated to auth token storage
- Any API endpoint not in the `/api/platform/auth` prefix
- Socket.IO connections in development mode
- Existing tests and build processes (except removal of dead code imports)

## Hypothesized Root Cause

Based on code analysis, the root causes are:

1. **Auth Route Blocking (Bug 1.1)**: `PUBLIC_PREFIXES` in `security.ts` line 82 contains only `"/api/platform/users"`. The auth routes are mounted at `/api/platform/auth/*` but this prefix was never added to the whitelist. The condition `PUBLIC_PREFIXES.some((p) => req.path.startsWith(p) && req.method === "POST")` fails for all auth routes.

2. **Weak Password Hashing (Bug 1.2)**: `AuthService.hash()` at line 107 uses `createHash("sha256").update(input).digest("hex")` — a single-pass unsalted hash. No salt, no key-stretching, no cost factor. This was likely a development placeholder never upgraded for production.

3. **Insecure Token Storage (Bug 1.3)**: `authApi.ts` uses `localStorage.setItem(TOKEN_KEY, token)` and `localStorage.setItem(REFRESH_KEY, refreshToken)` directly. The architecture was designed for client-side token handling without considering XSS attack vectors.

4. **Missing JWT Validation (Bug 1.4)**: `authMiddleware` at line 110 has a comment "JWT/token validation would go here in production" and only checks `authHeader?.startsWith("Bearer ")` — presence of the prefix is sufficient, no cryptographic verification occurs.

5. **Superficial Socket.IO Auth (Bug 1.5)**: The Socket.IO middleware in `server/src/index.ts` line 54 checks `if (!token)` but when a token IS present, it simply calls `next()` without validating against `AuthService.validateToken()`. The comment says "full validation with AuthService in production" but it was never implemented.

6. **Dead Code Accumulation (Bug 1.6)**: Feature development left orphaned files: `AiEngineDemoPage.tsx` (no route points to it), `src/hooks/` (unused hook directory), `src/utils/cn.ts` (unreferenced utility), `src/types/index.ts` (unreferenced types), and `studioService.ts` (calls `/api/v1/studio` which doesn't exist — the actual routes are at `/api/studio`).

7. **Stale Documentation (Bug 1.7)**: Documentation was written at an earlier project stage and never updated as features were connected. Analytics and Lua Gen have been integrated but docs still reflect their unconnected state.

8. **Missing Infrastructure (Bug 1.8)**: The project was developed entirely for local execution. No containerization, migration management, reverse proxy config, or backup strategy was ever created.

## Correctness Properties

Property 1: Bug Condition - Auth Routes Accessible in Production

_For any_ HTTP request to `/api/platform/auth/login`, `/api/platform/auth/register`, or `/api/platform/auth/refresh` with method POST in production mode, the authMiddleware SHALL allow the request through without requiring a Bearer token, enabling unauthenticated users to authenticate.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Password Hashing Uses bcrypt

_For any_ registration or login operation, the system SHALL hash passwords using bcrypt with a cost factor of at least 12, producing unique salted hashes that resist rainbow table and brute-force attacks. The same plaintext password hashed twice SHALL produce different hash strings (due to random salt).

**Validates: Requirements 2.2**

Property 3: Bug Condition - Token Storage Uses httpOnly Cookies

_For any_ successful authentication response, the server SHALL deliver tokens via httpOnly, Secure, SameSite=Strict cookies. The response body SHALL NOT contain raw token strings for client-side storage, and the frontend SHALL NOT write tokens to localStorage.

**Validates: Requirements 2.3**

Property 4: Bug Condition - JWT Cryptographic Validation

_For any_ request with an Authorization Bearer token in production mode, the authMiddleware SHALL cryptographically validate the token by verifying signature, expiration, and issuer via `AuthService.validateToken()`. Invalid, expired, or malformed tokens SHALL result in 401 responses.

**Validates: Requirements 2.4**

Property 5: Bug Condition - Socket.IO JWT Handshake Validation

_For any_ Socket.IO connection attempt in production mode, the server SHALL validate the provided JWT during handshake using `AuthService.validateToken()` and SHALL reject connections with invalid, expired, or missing tokens by passing an Error to the next callback.

**Validates: Requirements 2.5**

Property 6: Bug Condition - Dead Code Removal

_For any_ production build, the codebase SHALL NOT contain `AiEngineDemoPage.tsx`, `src/hooks/` directory, `src/utils/cn.ts`, `src/types/index.ts`, or `studioService.ts`. The `/ai-engine` route and unused `navItems` constant SHALL be removed. `studioService.ts` functionality SHALL be merged into `studioBridgeApi.ts` using the correct `/api/studio` base path.

**Validates: Requirements 2.6**

Property 7: Bug Condition - Documentation Accuracy

_For any_ read of project documentation, `CURRENT_STATE.md`, `ROADMAP_STATUS.md`, and `DECISION_LOG.md` SHALL accurately reflect the current state including Analytics as "connected", Lua Gen as "connected", correct page count, component count, and service count.

**Validates: Requirements 2.7**

Property 8: Bug Condition - Production Infrastructure Exists

_For any_ production deployment attempt, the repository SHALL contain a multi-stage Dockerfile, an automatic migration runner with `schema_migrations` tracking table, an nginx reverse proxy configuration example, and a database backup shell script.

**Validates: Requirements 2.8**

Property 9: Preservation - Development Mode Bypass

_For any_ request in development mode (`NODE_ENV !== "production"`), the system SHALL continue to skip all authentication checks on all routes and allow all Socket.IO connections, producing the same behavior as the original unfixed code.

**Validates: Requirements 3.1, 3.4**

Property 10: Preservation - Valid Token Access

_For any_ request with a valid (properly issued, non-expired) token to any protected `/api/*` route in production mode, the fixed system SHALL continue to authorize the request and return the expected response with unchanged format.

**Validates: Requirements 3.2, 3.3**

Property 11: Preservation - Existing Tests and Build

_For any_ execution of `vitest run`, all previously passing tests SHALL continue to pass. TypeScript compilation and Vite build SHALL succeed after dead code removal.

**Validates: Requirements 3.6, 3.7**

Property 12: Preservation - Security Infrastructure

_For any_ request processed by rate limiter, Helmet headers, or CORS middleware, the behavior SHALL remain identical to the original unfixed code.

**Validates: Requirements 3.8**

## Fix Implementation

### Changes Required

**File**: `server/src/common/middleware/security.ts`

**Function**: `authMiddleware`

**Specific Changes**:

1. **Add auth prefix to PUBLIC_PREFIXES**: Add `"/api/platform/auth"` to the `PUBLIC_PREFIXES` array so that login, register, and refresh routes are publicly accessible in production
2. **Implement cryptographic token validation**: Replace the `authHeader?.startsWith("Bearer ")` check with actual validation via `AuthService.validateToken(token)`. Extract the token from the header, validate it, and attach the session/user to the request object. Return 401 for invalid/expired tokens.
3. **Strengthen API key validation**: Replace the `apiKey.length > 10` check with proper API key verification against a stored key set or environment variable

---

**File**: `server/src/platform/auth/AuthService.ts`

**Function**: `hash()`, `register()`, `login()`

**Specific Changes**:

1. **Replace SHA-256 with bcrypt**: Install `bcrypt` (or `bcryptjs` for pure JS), replace `createHash("sha256")` with `bcrypt.hash(password, 12)` in registration and `bcrypt.compare(password, hash)` in login
2. **Make hash functions async**: bcrypt operations are async; update `register()` and `login()` to be async methods
3. **Add migration path**: Existing SHA-256 hashes in any persisted store should be re-hashed on next successful login (transparent upgrade)

---

**File**: `server/src/index.ts`

**Socket.IO middleware section**

**Specific Changes**:

1. **Implement JWT validation in Socket.IO handshake**: Import `AuthService` instance and call `authService.validateToken(token)` in the `io.use()` middleware. Reject with `next(new Error("Invalid token"))` if validation fails.

---

**File**: `src/services/authApi.ts`

**Functions**: `storeTokens()`, `getStoredToken()`, `clearTokens()`, `loginApi()`, `registerApi()`

**Specific Changes**:

1. **Remove localStorage token storage**: Delete `storeTokens()`, `getStoredToken()`, and `clearTokens()` localStorage operations
2. **Switch to cookie-based auth**: Set `credentials: 'include'` on all fetch calls. Server will set httpOnly cookies; frontend no longer handles raw tokens
3. **Update login/register flows**: Remove `storeTokens()` calls from `loginApi()` and `registerApi()` response handling
4. **Update AuthContext**: Remove `getStoredToken()` usage from session restoration; rely on cookie-authenticated `/api/platform/auth/me` call instead

---

**File**: `server/src/common/middleware/security.ts` (or new cookie utility)

**Specific Changes**:

1. **Add cookie-setting utility**: After successful login/register, set `token` and `refreshToken` as httpOnly, Secure (in production), SameSite=Strict cookies
2. **Add cookie-reading middleware**: Update `authMiddleware` to also read tokens from cookies (not just Authorization header) for browser clients

---

**Dead Code Removal** (multiple files):

1. **Delete** `src/pages/AiEngineDemoPage.tsx`
2. **Delete** `src/hooks/` directory (contains `index.ts` and `useSocket.ts` — verify no imports reference these)
3. **Delete** `src/utils/cn.ts`
4. **Delete** `src/types/index.ts`
5. **Delete** `src/services/studioService.ts` — merge any unique functionality into `studioBridgeApi.ts` using `/api/studio` base path
6. **Remove** the `/ai-engine` route from the app router (if it exists)
7. **Remove** unused `navItems` constant (locate and delete)

---

**Documentation Updates**:

1. **Update** `CURRENT_STATE.md` — correct Analytics status, Lua Gen status, page/component/service counts
2. **Update** `ROADMAP_STATUS.md` — reflect current feature completion state
3. **Update** `DECISION_LOG.md` — add entries for security hardening decisions

---

**Infrastructure Files** (new):

1. **Create** `Dockerfile` — multi-stage build (Node.js builder → production image)
2. **Create** `server/src/platform/storage/migrations/` — migration runner with `schema_migrations` table tracking
3. **Create** `deploy/nginx.conf` — reverse proxy configuration example
4. **Create** `scripts/backup-database.sh` — database backup shell script

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fix works correctly and preserves existing behavior. Each of the 8 bug categories requires targeted validation.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fixes. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write integration tests that exercise each bug condition against the UNFIXED code to observe failures and confirm root causes.

**Test Cases**:

1. **Auth Route Block Test**: Send POST to `/api/platform/auth/login` with `NODE_ENV=production` — expect 401 (will fail on unfixed code, confirming the PUBLIC_PREFIXES gap)
2. **Weak Hash Test**: Register a user, inspect the stored hash — expect SHA-256 hex format without salt (confirms weak hashing)
3. **localStorage Exposure Test**: Call `loginApi()` and check `localStorage.getItem("roblox_ai_token")` — expect token present (confirms insecure storage)
4. **No Validation Test**: Send request with `Authorization: Bearer completely_fake_token` in production — expect 200 (confirms missing validation)
5. **Socket.IO Bypass Test**: Connect Socket.IO with `{auth: {token: "invalid"}}` in production — expect connection accepted (confirms superficial auth)
6. **Dead Code Import Test**: Check that `studioService.ts` fetches from `/api/v1/studio/status` — expect 404 (confirms dead code issue)

**Expected Counterexamples**:

- Auth routes return 401 because `/api/platform/auth` is not in PUBLIC_PREFIXES
- Passwords hash to the same value for the same input (no salt)
- Arbitrary Bearer strings pass authentication
- Socket.IO connections with fake tokens succeed in production mode

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT expectedBehavior(result)
END FOR
```

Specifically:

- Auth routes return 200/success for valid credentials without requiring pre-existing token
- bcrypt hashes are unique per call (salt verification)
- Tokens are in httpOnly cookies, not in response body or localStorage
- Invalid Bearer tokens return 401
- Invalid Socket.IO tokens disconnect the client
- Dead code files do not exist after removal
- Documentation contains accurate counts and statuses
- Dockerfile builds successfully, migration runner executes, nginx config is valid

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original system.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for valid-token access, development mode, and non-auth endpoints, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Development Mode Preservation**: Verify all routes remain accessible without tokens when `NODE_ENV !== "production"` — observe on unfixed code, then verify continues after fix
2. **Valid Token Access Preservation**: Verify that properly issued tokens continue to grant access to all protected endpoints — observe on unfixed code, then verify continues after fix
3. **API Response Format Preservation**: Verify `/api/projects`, `/api/concept`, `/api/analytics` responses maintain identical JSON structure — observe on unfixed code, then verify continues after fix
4. **Socket.IO Dev Connection Preservation**: Verify Socket.IO connections without tokens succeed in development — observe on unfixed code, then verify continues after fix
5. **In-Memory Storage Preservation**: Verify application starts and functions without PostgreSQL when `STORAGE_PROVIDER=inmemory` — observe on unfixed code, then verify continues after fix
6. **Frontend Routing Preservation**: Verify all existing routes render correctly after dead code removal
7. **Security Middleware Preservation**: Verify rate limiting, Helmet headers, and CORS remain identical

### Unit Tests

- Test `authMiddleware` with auth routes returning 200 in production (no token required)
- Test `authMiddleware` rejecting invalid tokens for protected routes
- Test `authMiddleware` accepting valid tokens for protected routes
- Test `AuthService.register()` produces bcrypt hashes (starts with `$2b$12$`)
- Test `AuthService.login()` verifies bcrypt hashes correctly
- Test same password hashed twice yields different strings
- Test cookie-setting utility produces correct httpOnly, Secure, SameSite attributes
- Test Socket.IO middleware rejects invalid tokens in production
- Test Socket.IO middleware accepts valid tokens in production
- Test Socket.IO middleware allows all connections in development

### Property-Based Tests

- Generate random route paths and methods to verify PUBLIC_PREFIXES whitelist is correct and complete (auth routes public, all others gated)
- Generate random password strings to verify bcrypt always produces unique salted hashes and `bcrypt.compare` correctly validates
- Generate random token strings to verify authMiddleware consistently rejects non-AuthService-issued tokens
- Generate random valid and invalid tokens for Socket.IO to verify handshake validation boundary
- Generate random API requests with valid tokens to verify response format preservation

### Integration Tests

- Full auth flow: register → login (receives cookie) → access protected route → refresh → logout
- Socket.IO flow: connect with valid token → join project → receive events → disconnect
- Build verification: `tsc --noEmit` and `vite build` succeed after dead code removal
- Docker build: multi-stage Dockerfile produces runnable container
- Migration runner: creates `schema_migrations` table and applies pending migrations
- Nginx config: validates with `nginx -t`
