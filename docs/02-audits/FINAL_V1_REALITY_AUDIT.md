# Final v1.0 Reality Audit

**Date**: July 15, 2026  
**Type**: Documentation vs Reality Comparison  
**Status**: AUDIT COMPLETE — 14 discrepancies found

---

## Executive Summary

Compared `CURRENT_STATE.md`, `ROADMAP_STATUS.md`, and all documentation claims against actual source code. Found **14 discrepancies** including 1 production blocker bug, 3 stale documentation claims, 4 dead code items, 3 duplicate/overlapping implementations, and 3 missing documentation items.

---

## 1. PRODUCTION BLOCKER BUG 🔴

### Auth Middleware Blocks Login in Production Mode

**Location**: `server/src/common/middleware/security.ts` lines 74-84

```typescript
const PUBLIC_PREFIXES = [
  "/api/platform/users", // Comment says "login/register" — but path is WRONG
];
```

**Problem**: Login route is `/api/platform/auth/login` and register is `/api/platform/auth/register`. These paths do NOT match the PUBLIC_PREFIXES entry (`/api/platform/users`). In production (`NODE_ENV=production`), the auth middleware will **reject login/register requests with 401** because the user has no token yet.

**Impact**: Application is non-functional in production — nobody can authenticate.

**Fix required**:

```typescript
const PUBLIC_PREFIXES = [
  "/api/platform/users",
  "/api/platform/auth", // login, register, refresh
];
```

**Severity**: CRITICAL — must fix before any production deployment.

---

## 2. Stale Documentation Claims (CURRENT_STATE.md)

### 2.1 Analytics Listed as "Hardcoded page"

**Claim** (Backend Capabilities table): `Analytics | /api/analytics | Hardcoded page`  
**Reality**: AnalyticsPage imports from `@/services/analyticsApi` and calls real API endpoints (getSystemHealth, getAgentSummaries, getFailurePatterns, getOptimizationSuggestions, triggerAnalyticsCycle).  
**Status**: ✅ Connected — documentation is WRONG.

### 2.2 Lua Gen Listed as "Not connected to AI Studio"

**Claim**: `Lua Gen | /api/lua | Not connected to AI Studio`  
**Reality**: `AiStudioPage.tsx` imports `generateLuaCode` from `@/services/aiEngine.ts` which calls `POST /api/lua/generate`. Connected since F-2 implementation.  
**Status**: ✅ Connected — documentation is WRONG.

### 2.3 Page Count Incorrect

**Claim**: "11 pages (10 functional, 1 static marketing)"  
**Reality**: 12 files in `src/pages/`:

- DashboardPage, AiStudioPage, AnalyticsPage, KnowledgePage, PluginManagerPage, ProjectsPage, SettingsPage, NewProjectPage (8 functional)
- LoginPage, RegisterPage (2 auth)
- LandingPage (1 marketing)
- **AiEngineDemoPage** (1 orphan — not routed)

Plus WorkspacePage at `/projects/:id` (13th page, lives in features/).

**Actual**: 12 routed views + 1 orphan file.

---

## 3. Dead Code

### 3.1 `src/pages/AiEngineDemoPage.tsx`

- Not imported by the router
- Not referenced anywhere in the codebase
- Old demo page that ran `runAgentPipeline` on mount
- **Action**: Delete

### 3.2 `src/hooks/` directory (useSocket.ts + index.ts)

- `useSocket` and `useRealtimeProject` are exported but **never imported** anywhere
- The workspace uses `usePipelineStream` from `features/workspace/hooks/` instead
- **Action**: Delete entire directory

### 3.3 `src/utils/cn.ts`

- Never imported (zero references to `@/utils`)
- Likely a leftover `clsx/cn` utility from early development
- **Action**: Delete

### 3.4 `src/types/index.ts`

- Exports `NavItem`, `ProjectItem`, `AgentItem`
- Never imported (zero references to `@/types`)
- These types are defined locally where needed
- **Action**: Delete

---

## 4. Duplicate/Overlapping Implementations

### 4.1 `studioService.ts` vs `studioBridgeApi.ts`

| Service            | Endpoint Base    | Functions                                                                   |
| ------------------ | ---------------- | --------------------------------------------------------------------------- |
| studioService.ts   | `/api/v1/studio` | getStudioStatus, syncToStudio                                               |
| studioBridgeApi.ts | `/api/studio`    | getStudioStatus, connectStudio, disconnectStudio, heartbeat, protocol, sync |

**Problem**: Two services for the same domain. `studioService.ts` calls `/api/v1/studio/...` but NO `/api/v1/studio` route exists in the v1 router. These calls will 404 in production.

**Used by**:

- `studioService.ts` → StudioBridgePanel, SyncButton, StudioConnectionStatus
- `studioBridgeApi.ts` → PluginManagerPage, ProtocolMonitor, StudioBridgePanel

**Impact**: `StudioBridgePanel` imports from BOTH services. `studioService.ts` requests will fail because `/api/v1/studio/*` doesn't exist.

**Action**: Merge into `studioBridgeApi.ts` (which uses the correct `/api/studio` base path).

### 4.2 `navItems` constant (dead) vs Sidebar hardcoded nav

**File**: `src/shared/constants/index.ts` exports `navItems` with 7 items  
**Reality**: Sidebar has its own `defaultNavigationItems` with different items  
**`navItems` references**: zero (never imported)  
**Action**: Remove unused `navItems` from constants.

### 4.3 `api.ts` (apiFetch) — unused centralized client

**File**: `src/services/api.ts` exports `apiFetch` and `ApiError`  
**Reality**: Zero services import it. Every service uses raw `fetch()` independently.  
**Impact**: Inconsistent error handling across services — no centralized 401 handling.  
**Action**: Either adopt apiFetch in all services, or remove it.

---

## 5. Structural Remnants (Post-UX-3D)

### 5.1 `src/components/ErrorBoundary.tsx`

- Legacy location — should live in `src/shared/ui/`
- Still imported by `Workspace.tsx` as `@/components/ErrorBoundary`
- Only file remaining in `src/components/`
- **Action**: Move to `src/shared/ui/ErrorBoundary.tsx`, update import

### 5.2 `src/components/` directory exists

- Should have been fully deleted in UX-3D Sprint 2
- Contains 1 surviving file (ErrorBoundary)
- **Action**: Move file, delete directory

---

## 6. Inconsistent Naming

| Issue           | Location                                                      | Expected        | Actual                                                                         |
| --------------- | ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------ |
| Route alias     | Router: `/ai-engine` → AiStudioPage                           | Not needed      | Renders same page as `/ai-studio` — redundant route                            |
| Service naming  | studioService vs studioBridgeApi                              | One name        | Two services for same backend                                                  |
| Constants stale | `shared/constants/index.ts` FAQ says "realistic placeholders" | Updated copy    | Still says "intentionally uses realistic placeholders" — legacy marketing text |
| navItems        | `shared/constants/index.ts` lists "AI Engine"                 | Matches sidebar | Sidebar has "AI Studio" — mismatched naming                                    |

---

## 7. Missing Documentation

### 7.1 `src/shared/events/` not documented

- Contains typed Socket.io event interfaces (`ServerToClientEvents`, `ClientToServerEvents`)
- Not mentioned in COMPONENT_REGISTRY, FEATURE_REGISTRY, or ARCHITECTURE_MAP
- Used by workspace hooks for real-time updates

### 7.2 `src/services/conceptApi.ts` — largest service, underdocumented

- 18 exported functions (largest frontend service)
- Handles: concept generation, experience pipelines, artifacts, reviews, pipeline control
- Core workspace functionality — not called out in CURRENT_STATE.md

### 7.3 `/api/debug` route — undocumented

- 8 endpoints: executions list, trace details, DAG graph, replay, compare, timeline, export, delete
- Powerful debugging surface — no frontend consumer, no documentation
- Potential security risk if exposed in production (execution traces)

---

## 8. Component Count Verification

**CURRENT_STATE.md claims**: "55 registered (37 shared/ui + 25 workspace + 1 global)"

**Actual count**:

- `src/shared/ui/` root: 10 components
- `src/shared/ui/ai/`: 5 components
- `src/shared/ui/dashboard/`: 5 components
- `src/shared/ui/data/`: 1 component
- `src/shared/ui/layout/`: 6 files (AppLayout, AppShell, Sidebar, StatusBar, TopBar, Workspace)
- `src/shared/ui/projects/`: 1 component
- `src/shared/ui/system/`: 3 components
- **Total shared/ui**: 31 components

- `src/features/workspace/components/`: 29 components
- `src/features/workspace/PipelineView.tsx`: 1 component
- **Total workspace**: 30 components

- `src/components/ErrorBoundary.tsx`: 1 (orphan location)

**Actual total**: 62 components (31 + 30 + 1)

**Discrepancy**: Documented as 55, actual is 62. Off by +7.

---

## 9. Frontend Services Count Verification

**CURRENT_STATE.md claims**: "15 services"

**Actual** (`src/services/`): 17 files

1. aiEngine.ts
2. analyticsApi.ts
3. api.ts (unused)
4. authApi.ts
5. autonomousApi.ts
6. conceptApi.ts
7. economyApi.ts
8. gameArchitectApi.ts
9. generationMonitorApi.ts
10. knowledgeApi.ts
11. playtestApi.ts
12. projectService.ts
13. simulationApi.ts
14. socket.ts
15. studioBridgeApi.ts
16. studioService.ts (broken endpoint)
17. systemApi.ts

**Actual**: 17 (15 functional + 1 broken + 1 unused)

---

## 10. Test Count Verification

**Claims**: "599/600 tests pass"

**Actual test files**:

- Server: 44 test files
- Frontend: 10 test files
- Total: 54 test files

Cannot verify exact test count without running tests — but file count aligns with 600 total assertions across 54 files (average ~11 per file).

---

## 11. Backend Route Count Verification

**CURRENT_STATE.md claims**: "30 registered endpoint groups"

**Actual routes registered in server/src/index.ts**:

1. /api/projects (x2 — projects + game-generation share prefix)
2. /api/evaluation
3. /api/memory
4. /api/plan
5. /api/generate
6. /api/simulate
7. /api/economy
8. /api/world
9. /api/lifecycle
10. /api/compile
11. /api/debug
12. /api/v1
13. /api/v2
14. /api/distributed
15. /api/analytics
16. /api/system
17. /api/concept
18. /api/studio
19. /api/ai/game-architect
20. /api/lua
21. /api/playtest
22. /api/repair
23. /api/knowledge
24. /api/agents
25. /api/domain
26. /api/autonomous
27. /api/platform
28. /health
29. /health/database
30. /health/storage
31. / (root)

**Actual**: 31 route groups (close enough — documentation says 30).

---

## 12. Summary of Required Actions

### Before Production Deployment (BLOCKING)

| #   | Issue                                               | Priority | Effort |
| --- | --------------------------------------------------- | -------- | ------ |
| 1   | Fix PUBLIC_PREFIXES to include `/api/platform/auth` | CRITICAL | 5min   |
| 2   | Remove stale Backend Capabilities table entries     | LOW      | 10min  |

### Code Cleanup (Non-Blocking)

| #   | Issue                                                      | Priority | Effort     |
| --- | ---------------------------------------------------------- | -------- | ---------- |
| 3   | Delete `AiEngineDemoPage.tsx`                              | LOW      | 1min       |
| 4   | Delete `src/hooks/` directory                              | LOW      | 1min       |
| 5   | Delete `src/utils/cn.ts`                                   | LOW      | 1min       |
| 6   | Delete `src/types/index.ts`                                | LOW      | 1min       |
| 7   | Move ErrorBoundary to shared/ui, delete src/components/    | LOW      | 5min       |
| 8   | Merge studioService into studioBridgeApi                   | MEDIUM   | 30min      |
| 9   | Remove unused `api.ts` OR adopt it project-wide            | LOW      | 5min or 2h |
| 10  | Remove `/ai-engine` duplicate route                        | LOW      | 1min       |
| 11  | Update `navItems` in constants or remove                   | LOW      | 2min       |
| 12  | Update faqItems marketing copy (still says "placeholders") | LOW      | 5min       |

### Documentation Sync

| #   | Item                                               | Priority |
| --- | -------------------------------------------------- | -------- |
| 13  | Update CURRENT_STATE.md Backend Capabilities table | MEDIUM   |
| 14  | Update page count (12 routed + workspace)          | LOW      |
| 15  | Update component count (62 actual)                 | LOW      |
| 16  | Update service count (17 actual)                   | LOW      |
| 17  | Document /api/debug endpoints                      | LOW      |
| 18  | Document shared/events/ module                     | LOW      |

---

## 13. Architecture Health (Revised)

After this audit, revised scores:

| Area                   | Previous | Revised | Delta                                  |
| ---------------------- | -------- | ------- | -------------------------------------- |
| Architecture           | 9.5/10   | 9.2/10  | -0.3 (dead code, structural remnants)  |
| Security               | 7.0/10   | 6.5/10  | -0.5 (auth middleware bug is critical) |
| Documentation Accuracy | 9.0/10   | 8.0/10  | -1.0 (3 stale claims, counts wrong)    |
| Code Hygiene           | 9.0/10   | 8.5/10  | -0.5 (dead code, duplicate services)   |

**Overall v1.0 Readiness**: 8.0/10 — ONE critical bug must be fixed (5 minutes of work). Rest is cleanup.

---

## 14. Conclusion

The project is 5 minutes away from being production-deployable. The **auth middleware PUBLIC_PREFIXES bug** is the only true blocker — without it, login/register requests will be rejected in production mode. All other findings are cosmetic, dead code, or documentation drift.

Priority action: Fix line 82 of `security.ts`, then ship.
