# Bugfix Requirements Document

## Introduction

The RobloxAiStudio-DevKit v1.0 candidate is feature-complete but has multiple security defects and deployment gaps that block production release. This hardening sprint addresses 8 categories of issues: a production auth blocker, weak password hashing, insecure token storage, missing JWT validation, superficial Socket.IO auth, dead code accumulation, stale documentation, and missing production infrastructure. No new features or UI redesign — only fixes to make the existing application deployable and secure.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `NODE_ENV=production` and a user attempts to call `/api/platform/auth/login` or `/api/platform/auth/register` THEN the system returns 401 "Authentication required" because `PUBLIC_PREFIXES` in `security.ts` only contains `/api/platform/users` and does not include `/api/platform/auth`

1.2 WHEN a user registers or logs in THEN the system hashes passwords using unsalted SHA-256 (`createHash("sha256")`) which is trivially reversible via rainbow tables if the database is compromised

1.3 WHEN the frontend receives an auth token after login THEN the system stores the token and refresh token in `localStorage` which is accessible to any XSS attack vector on the page

1.4 WHEN a request includes an `Authorization: Bearer <any-string>` header THEN the `authMiddleware` passes the request through without cryptographic validation — any arbitrary string satisfies authentication

1.5 WHEN a Socket.IO client connects in production with any non-empty token string THEN the server accepts the connection without validating the token against `AuthService.validateToken()`

1.6 WHEN the application is built and served THEN dead code remains in the bundle including `AiEngineDemoPage.tsx` (unrouted), `src/hooks/` (unused), `src/utils/cn.ts` (unreferenced), `src/types/index.ts` (unreferenced), and `studioService.ts` (calls non-existent `/api/v1/studio` routes)

1.7 WHEN a developer or operator reads `CURRENT_STATE.md` THEN they encounter stale claims: Analytics listed as "Hardcoded page" (actually connected since F-1), Lua Gen listed as "Not connected to AI Studio" (connected since F-2), incorrect page/component/service counts

1.8 WHEN deploying to production THEN there is no Dockerfile for the application, no automatic migration runner on startup, no reverse proxy configuration example, and no database backup script

### Expected Behavior (Correct)

2.1 WHEN `NODE_ENV=production` and a user calls any route under `/api/platform/auth/*` with method POST THEN the system SHALL allow the request without requiring a token (login, register, and refresh must be publicly accessible)

2.2 WHEN a user registers or logs in THEN the system SHALL hash passwords using bcrypt with a cost factor of at least 12, producing salted hashes that resist rainbow table and brute-force attacks

2.3 WHEN the server issues auth tokens THEN the system SHALL deliver them via httpOnly, Secure, SameSite=Strict cookies — the frontend SHALL NOT store tokens in localStorage and SHALL implement a proper refresh flow and logout cleanup

2.4 WHEN a request includes a Bearer token THEN the `authMiddleware` SHALL cryptographically validate the token by verifying its signature, checking expiration, confirming the issuer, and validating the audience claim (if configured) via `AuthService.validateToken()`

2.5 WHEN a Socket.IO client connects in production THEN the server SHALL validate the provided JWT during the handshake using `AuthService.validateToken()` and SHALL reject connections with invalid, expired, or missing tokens

2.6 WHEN the application is built THEN all dead code SHALL be removed: `AiEngineDemoPage.tsx` deleted, `src/hooks/` directory deleted, `src/utils/cn.ts` deleted, `src/types/index.ts` deleted, `studioService.ts` merged into `studioBridgeApi.ts` (using correct `/api/studio` base path), orphan route `/ai-engine` removed, and unused `navItems` constant removed

2.7 WHEN a developer or operator reads project documentation THEN `CURRENT_STATE.md`, `ROADMAP_STATUS.md`, and `DECISION_LOG.md` SHALL accurately reflect the current state — Analytics as "connected", Lua Gen as "connected", correct page count (12 routed + workspace), correct component count (62), correct service count (17), and all stale statements removed

2.8 WHEN deploying to production THEN the repository SHALL include: a multi-stage Dockerfile for the application, an automatic migration runner that applies pending schema versions on startup (with a `schema_migrations` tracking table), a reverse proxy configuration example (nginx), and a database backup shell script

### Implementation Constraints

- **Incremental execution**: Complete one hardening task at a time. After each task: TypeScript build must pass, Vite build must pass, existing tests must pass, and tests must be added or updated for the modified code.
- **Backward compatibility**: Do not change public REST API contracts unless absolutely required. Existing frontend behavior must remain unchanged.
- **Security first**: Never reduce existing security guarantees while implementing another task.
- **Documentation**: Update CURRENT_STATE.md, ROADMAP_STATUS.md, and DECISION_LOG.md after every completed task, not only at the end.
- **Rollback**: Every task must be implemented as an isolated commit-sized change that can be reverted independently.
- **Validation**: After each completed task generate a short validation report including: files changed, tests executed, build status, security impact, and rollback risk.
- **Code quality**: Reuse existing services, utilities, and abstractions. Do not introduce duplicate implementations. Verify an implementation does not already exist before adding new code.
- **Final deliverable**: Finish with a Final Release Hardening Report (RELEASE_HARDENING_REPORT.md) summarizing all completed fixes and remaining risks, plus V1_RELEASE_NOTES.md, before declaring the project production-ready.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `NODE_ENV=development` THEN the system SHALL CONTINUE TO skip authentication checks on all routes (development bypass preserved)

3.2 WHEN a user with a valid token accesses any protected `/api/*` route THEN the system SHALL CONTINUE TO authorize the request and return the expected response

3.3 WHEN the frontend makes API calls to `/api/projects`, `/api/concept`, `/api/analytics`, or any other existing endpoint THEN the system SHALL CONTINUE TO return the same response format and data

3.4 WHEN Socket.IO clients connect in development mode THEN the system SHALL CONTINUE TO allow connections without token validation

3.5 WHEN the system starts with `STORAGE_PROVIDER=inmemory` (default) THEN the system SHALL CONTINUE TO function without PostgreSQL — the migration runner SHALL only execute when a database connection is available

3.6 WHEN existing tests are run via `vitest run` THEN all previously passing tests SHALL CONTINUE TO pass (TypeScript compilation, Vite build, and test suite unaffected by dead code removal)

3.7 WHEN the frontend routing navigates to `/ai-studio`, `/analytics`, `/knowledge`, `/settings`, or any other existing page THEN the system SHALL CONTINUE TO render those pages correctly after dead code removal

3.8 WHEN the server processes rate-limited requests, applies helmet security headers, or enforces CORS THEN the system SHALL CONTINUE TO apply these protections identically to current behavior
