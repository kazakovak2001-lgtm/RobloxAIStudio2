# Implementation Plan

## Overview

This task list implements the release hardening bugfix using the exploratory bugfix workflow. The approach is: (1) write tests BEFORE the fix to confirm bugs exist, (2) write preservation tests to capture baseline behavior, (3) implement fixes incrementally for each of the 8 bug categories, and (4) validate all fixes pass and no regressions are introduced.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Release Hardening Security Defects
  - **IMPORTANT**: Write this property-based test BEFORE implementing any fixes
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fixes when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the 8 categories of security and deployment bugs exist
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases for each bug category:
    - Auth Route Block: POST to `/api/platform/auth/login` in production returns 401 (from `isBugCondition: input.route.startsWith("/api/platform/auth") AND input.route NOT IN PUBLIC_PREFIXES`)
    - Weak Hashing: Register a user, verify hash is unsalted SHA-256 (same password yields same hash)
    - Missing JWT Validation: Send `Authorization: Bearer arbitrary_string` in production, verify it passes auth (no cryptographic validation)
    - Socket.IO Bypass: Connect with `{auth: {token: "fake"}}` in production, verify connection accepted
  - Test assertions should match Expected Behavior Properties from design:
    - Auth routes SHALL allow POST requests without requiring a Bearer token
    - Passwords SHALL be hashed with bcrypt cost factor ≥ 12 (unique per hash)
    - Invalid Bearer tokens SHALL result in 401 responses
    - Socket.IO connections with invalid tokens SHALL be rejected
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - `/api/platform/auth/login` returns 401 because PUBLIC_PREFIXES only contains `/api/platform/users`
    - Same password hashed twice yields identical SHA-256 hex (no salt)
    - `Bearer completely_fake_token` passes authMiddleware (presence-only check)
    - Socket.IO accepts connection with fake token (only checks `if (!token)`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Development Mode and Valid Token Access
  - **IMPORTANT**: Follow observation-first methodology
  - **IMPORTANT**: Write these tests BEFORE implementing any fixes
  - Observe behavior on UNFIXED code for non-buggy inputs (cases where `isBugCondition` returns false):
    - Observe: All routes accessible without tokens when `NODE_ENV=development` (dev bypass works)
    - Observe: Valid-token requests to `/api/projects`, `/api/concept`, `/api/analytics` return expected JSON structure
    - Observe: Socket.IO connections without tokens succeed in development mode
    - Observe: Application starts and functions with `STORAGE_PROVIDER=inmemory` (no PostgreSQL needed)
    - Observe: `vitest run` passes all existing tests
    - Observe: `tsc --noEmit` and `vite build` succeed
    - Observe: Rate limiting, Helmet headers, and CORS enforcement behave correctly
  - Write property-based tests capturing observed behavior patterns (from Preservation Requirements in design):
    - For all routes in development mode: requests without tokens return 200/expected responses
    - For all valid tokens with non-expired claims: protected route access returns expected response format
    - For all existing API endpoints (`/api/projects`, `/api/concept`, `/api/analytics`): response JSON structure matches observed schema
    - For all Socket.IO connections in development mode: connections succeed regardless of token
    - For all existing frontend routes (`/ai-studio`, `/analytics`, `/knowledge`, `/settings`): pages render correctly
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 3. Fix auth route blocking in production

  - [ ] 3.1 Add `/api/platform/auth` to PUBLIC_PREFIXES in security.ts
    - In `server/src/common/middleware/security.ts`, add `"/api/platform/auth"` to the `PUBLIC_PREFIXES` array
    - This allows login, register, and refresh routes to be publicly accessible in production
    - _Bug_Condition: isBugCondition(input) where input.env === "production" AND input.route.startsWith("/api/platform/auth") AND input.route NOT IN PUBLIC_PREFIXES_
    - _Expected_Behavior: authMiddleware SHALL allow POST requests to /api/platform/auth/\* without requiring a Bearer token_
    - _Preservation: Development mode bypass preserved; valid-token access unchanged_
    - _Requirements: 2.1, 3.1, 3.2_

  - [ ] 3.2 Verify bug condition exploration test now passes for auth routes
    - **Property 1: Expected Behavior** - Auth Routes Accessible in Production
    - **IMPORTANT**: Re-run the SAME test from task 1 (auth route portion) - do NOT write a new test
    - The test from task 1 encodes the expected behavior for auth routes
    - When this test passes, it confirms auth routes are now publicly accessible
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Auth route assertions PASS (confirms bug is fixed)
    - _Requirements: 2.1_

  - [ ] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Development Mode and Valid Token Access
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [ ] 4. Fix weak password hashing

  - [ ] 4.1 Replace SHA-256 with bcrypt in AuthService
    - Install `bcryptjs` package for pure JS bcrypt implementation
    - In `server/src/platform/auth/AuthService.ts`, replace `createHash("sha256").update(input).digest("hex")` with `bcrypt.hash(password, 12)`
    - Update `register()` to use async `bcrypt.hash(password, 12)`
    - Update `login()` to use async `bcrypt.compare(password, storedHash)`
    - Add transparent upgrade path: if existing hash doesn't start with `$2b$`, re-hash on successful login
    - _Bug_Condition: isBugCondition(input) where (input.action === "register" OR input.action === "login") AND hashAlgorithm === "sha256"_
    - _Expected_Behavior: passwords hashed with bcrypt cost factor ≥ 12, same plaintext produces different hashes_
    - _Preservation: Valid credentials continue to authenticate successfully_
    - _Requirements: 2.2, 3.2_

  - [ ] 4.2 Verify bug condition exploration test now passes for password hashing
    - **Property 1: Expected Behavior** - Password Hashing Uses bcrypt
    - **IMPORTANT**: Re-run the SAME test from task 1 (hashing portion) - do NOT write a new test
    - When this test passes, it confirms bcrypt is properly used with unique salted hashes
    - **EXPECTED OUTCOME**: Hashing assertions PASS (confirms bug is fixed)
    - _Requirements: 2.2_

  - [ ] 4.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Valid Token Access
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [ ] 5. Fix insecure token storage

  - [ ] 5.1 Implement httpOnly cookie-based token delivery
    - In `server/src/common/middleware/security.ts` (or new cookie utility), add cookie-setting utility after successful login/register
    - Set `token` and `refreshToken` as httpOnly, Secure (in production), SameSite=Strict cookies
    - Update `authMiddleware` to read tokens from cookies (in addition to Authorization header) for browser clients
    - In `src/services/authApi.ts`, remove `localStorage.setItem()` calls for tokens
    - Set `credentials: 'include'` on all fetch calls
    - Update AuthContext to use `/api/platform/auth/me` cookie-authenticated call for session restoration
    - _Bug_Condition: isBugCondition(input) where input.action === "storeToken" AND storageTarget === "localStorage"_
    - _Expected_Behavior: tokens delivered via httpOnly, Secure, SameSite=Strict cookies; frontend does NOT store tokens in localStorage_
    - _Preservation: Frontend API calls continue to work; auth flow remains functional_
    - _Requirements: 2.3, 3.2, 3.3_

  - [ ] 5.2 Verify localStorage no longer contains tokens after login
    - Confirm `localStorage.getItem("roblox_ai_token")` returns null after login
    - Confirm response body does not contain raw token strings
    - Confirm cookies are set with correct attributes (httpOnly, Secure, SameSite=Strict)
    - _Requirements: 2.3_

  - [ ] 5.3 Verify preservation tests still pass
    - **Property 2: Preservation** - API Response Format and Valid Access
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [ ] 6. Fix missing JWT cryptographic validation

  - [ ] 6.1 Implement token validation in authMiddleware
    - In `server/src/common/middleware/security.ts`, replace `authHeader?.startsWith("Bearer ")` check with actual validation
    - Extract token from `Authorization: Bearer <token>` header
    - Call `AuthService.validateToken(token)` to verify signature, expiration, and issuer
    - Attach decoded user/session to request object on success
    - Return 401 with appropriate message for invalid, expired, or malformed tokens
    - _Bug_Condition: isBugCondition(input) where input.hasAuthHeader AND input.env === "production" AND NOT cryptographicValidation(input.token)_
    - _Expected_Behavior: authMiddleware SHALL cryptographically validate tokens; invalid tokens return 401_
    - _Preservation: Valid tokens continue to grant access; development mode bypass preserved_
    - _Requirements: 2.4, 3.1, 3.2_

  - [ ] 6.2 Verify bug condition exploration test now passes for JWT validation
    - **Property 1: Expected Behavior** - JWT Cryptographic Validation
    - **IMPORTANT**: Re-run the SAME test from task 1 (JWT validation portion) - do NOT write a new test
    - When this test passes, it confirms arbitrary Bearer strings are rejected
    - **EXPECTED OUTCOME**: JWT validation assertions PASS (confirms bug is fixed)
    - _Requirements: 2.4_

  - [ ] 6.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Valid Token Access
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [ ] 7. Fix superficial Socket.IO auth

  - [ ] 7.1 Implement JWT validation in Socket.IO handshake middleware
    - In `server/src/index.ts` (or `server/src/socket/index.ts`), update the `io.use()` middleware
    - Import `AuthService` instance and call `authService.validateToken(token)` when token is present
    - On validation failure: call `next(new Error("Invalid token"))` to reject connection
    - On validation success: attach user data to socket and call `next()`
    - Preserve development mode bypass (skip validation when `NODE_ENV !== "production"`)
    - _Bug_Condition: isBugCondition(input) where input.isSocketConnection AND input.env === "production" AND NOT jwtValidation(input.socketToken)_
    - _Expected_Behavior: Socket.IO SHALL validate JWT during handshake; reject invalid/expired/missing tokens_
    - _Preservation: Development mode Socket.IO connections continue without validation_
    - _Requirements: 2.5, 3.4_

  - [ ] 7.2 Verify bug condition exploration test now passes for Socket.IO
    - **Property 1: Expected Behavior** - Socket.IO JWT Handshake Validation
    - **IMPORTANT**: Re-run the SAME test from task 1 (Socket.IO portion) - do NOT write a new test
    - When this test passes, it confirms fake tokens are rejected in production
    - **EXPECTED OUTCOME**: Socket.IO assertions PASS (confirms bug is fixed)
    - _Requirements: 2.5_

  - [ ] 7.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Socket.IO Dev Connection
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [ ] 8. Remove dead code

  - [ ] 8.1 Delete orphaned files and merge studioService
    - Delete `src/pages/AiEngineDemoPage.tsx`
    - Delete `src/hooks/` directory (contains `index.ts` and `useSocket.ts` — verify no imports reference these first)
    - Delete `src/utils/cn.ts`
    - Delete `src/types/index.ts`
    - Merge any unique functionality from `src/services/studioService.ts` into `studioBridgeApi.ts` using `/api/studio` base path, then delete `studioService.ts`
    - Remove the `/ai-engine` route from the app router
    - Remove unused `navItems` constant
    - _Bug_Condition: isBugCondition(input) where input.action === "build" AND deadCodeExists([...])_
    - _Expected_Behavior: dead code files removed; studioService merged into studioBridgeApi with correct base path_
    - _Preservation: All existing routes render correctly; existing tests pass; build succeeds_
    - _Requirements: 2.6, 3.6, 3.7_

  - [ ] 8.2 Verify TypeScript and Vite builds pass after removal
    - Run `tsc --noEmit` — must succeed
    - Run `vite build` — must succeed
    - Run `vitest run` — all previously passing tests must continue to pass
    - _Requirements: 3.6_

  - [ ] 8.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Tests and Build
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions from dead code removal)

- [ ] 9. Update stale documentation

  - [ ] 9.1 Correct CURRENT_STATE.md, ROADMAP_STATUS.md, and DECISION_LOG.md
    - Update Analytics status from "Hardcoded page" to "Connected" in CURRENT_STATE.md
    - Update Lua Gen status from "Not connected to AI Studio" to "Connected" in CURRENT_STATE.md
    - Correct page count to 12 routed + workspace
    - Correct component count to 62
    - Correct service count to 17
    - Remove all stale statements
    - Update ROADMAP_STATUS.md to reflect current feature completion state
    - Add security hardening decisions to DECISION_LOG.md
    - _Bug_Condition: isBugCondition(input) where input.action === "readDocs" AND docsContainStaleInfo()_
    - _Expected_Behavior: documentation accurately reflects current state_
    - _Preservation: No code behavior changes_
    - _Requirements: 2.7_

- [ ] 10. Add production infrastructure

  - [ ] 10.1 Create Dockerfile (multi-stage build)
    - Create `Dockerfile` at repository root with multi-stage build
    - Stage 1: Node.js builder (install dependencies, build TypeScript, build Vite)
    - Stage 2: Production image (copy built artifacts, minimal runtime)
    - Verify with `docker build .` (if Docker is available)
    - _Requirements: 2.8_

  - [ ] 10.2 Create automatic migration runner
    - Create `server/src/platform/storage/migrations/` directory
    - Implement migration runner that creates `schema_migrations` tracking table
    - Apply pending schema versions on startup
    - Only execute when a database connection is available (skip when `STORAGE_PROVIDER=inmemory`)
    - _Bug_Condition: isBugCondition(input) where input.action === "deploy" AND NOT infrastructureExists(["migrationRunner"])_
    - _Preservation: STORAGE_PROVIDER=inmemory continues to function without PostgreSQL_
    - _Requirements: 2.8, 3.5_

  - [ ] 10.3 Create nginx reverse proxy configuration
    - Create `deploy/nginx.conf` with reverse proxy configuration example
    - Include upstream to Node.js server, WebSocket upgrade support for Socket.IO, static file serving, security headers
    - Validate syntax if nginx is available (`nginx -t`)
    - _Requirements: 2.8_

  - [ ] 10.4 Create database backup script
    - Create `scripts/backup-database.sh`
    - Include pg_dump command with timestamp-based filename
    - Add retention policy (configurable days)
    - Make script executable
    - _Requirements: 2.8_

  - [ ] 10.5 Verify preservation tests still pass
    - **Property 2: Preservation** - In-Memory Storage Mode
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Verify application still starts with `STORAGE_PROVIDER=inmemory` without PostgreSQL
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [ ] 11. Final verification and release report

  - [ ] 11.1 Run full bug condition exploration test suite
    - **Property 1: Expected Behavior** - All Security Defects Fixed
    - Re-run the complete exploration test from task 1
    - **EXPECTED OUTCOME**: ALL assertions PASS (confirms all 8 bug categories are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ] 11.2 Run full preservation test suite
    - **Property 2: Preservation** - Complete Regression Check
    - Re-run the complete preservation tests from task 2
    - **EXPECTED OUTCOME**: ALL assertions PASS (confirms no regressions introduced)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ] 11.3 Generate RELEASE_HARDENING_REPORT.md and V1_RELEASE_NOTES.md
    - Create `RELEASE_HARDENING_REPORT.md` summarizing all completed fixes, files changed, tests executed, build status, security impact, and remaining risks
    - Create `V1_RELEASE_NOTES.md` with user-facing release notes
    - _Requirements: Implementation Constraints (Final deliverable)_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Run `vitest run` — all tests must pass
  - Run `tsc --noEmit` — TypeScript compilation must succeed
  - Run `vite build` — production build must succeed
  - Verify all property-based tests pass (both exploration and preservation)
  - Ensure all 8 bug categories are resolved
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    ["1", "2"],
    ["3"],
    ["4"],
    ["5"],
    ["6"],
    ["7"],
    ["8"],
    ["9"],
    ["10"],
    ["11"],
    ["12"]
  ]
}
```

## Notes

- Each implementation task (3-10) must be an isolated commit-sized change that can be reverted independently.
- After each task: TypeScript build must pass, Vite build must pass, existing tests must pass.
- Documentation (CURRENT_STATE.md, ROADMAP_STATUS.md, DECISION_LOG.md) should be updated after every completed task.
- Security guarantees must never be reduced while implementing another task.
- Use `vitest run` (not watch mode) for test execution.
- The exploration test in task 1 is expected to FAIL on unfixed code — this confirms the bugs exist. Do NOT attempt to fix the code or the test when this happens.
- The preservation tests in task 2 are expected to PASS on unfixed code — this captures baseline behavior to protect.
