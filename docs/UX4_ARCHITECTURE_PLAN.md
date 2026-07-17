# UX-4 Architecture Plan

**Date**: July 15, 2026  
**Purpose**: Architecture impact analysis for proposed features

---

## Architecture Impact by Feature

### F-1: Analytics Real Data

- **Modules affected**: src/pages/AnalyticsPage.tsx, src/services/ (new analyticsApi.ts)
- **New dependencies**: Chart library (recharts or chart.js)
- **Architecture layers**: Pages → Services → Backend
- **Risk**: LOW — Standard data-fetch pattern, no state changes
- **Effort**: 1 sprint

### F-2: AI Studio Chat Backend

- **Modules affected**: src/pages/AiStudioPage.tsx, src/services/aiEngine.ts
- **New dependencies**: None (uses existing services)
- **Architecture layers**: Pages → Services → Backend (WebSocket for streaming)
- **Risk**: MEDIUM — Streaming responses, error states, token management
- **Effort**: 1 sprint

### F-3: Plugin Manager Real Data

- **Modules affected**: src/pages/PluginManagerPage.tsx
- **New dependencies**: None (studioBridgeApi already exists)
- **Architecture layers**: Pages → Services (existing)
- **Risk**: LOW — Replace hardcoded data with API calls
- **Effort**: 1 sprint

### F-4: Game Simulation

- **Modules affected**: New page or workspace panel
- **New dependencies**: src/services/simulationApi.ts (new)
- **Architecture layers**: Features → Services → Backend
- **Risk**: MEDIUM — New feature boundary, complex data visualization
- **Effort**: 2 sprints

### F-5: Economy Designer

- **Modules affected**: New page (src/pages/EconomyPage.tsx)
- **New dependencies**: src/services/economyApi.ts (new)
- **Architecture layers**: Pages → Services → Backend
- **Risk**: LOW — CRUD pattern with form UI
- **Effort**: 1 sprint

### F-6: Autonomous Pipeline

- **Modules affected**: Workspace feature extension
- **New dependencies**: src/services/autonomousApi.ts (new)
- **Architecture layers**: Features → Services → Backend (WebSocket)
- **Risk**: HIGH — Complex state machine, long-running processes
- **Effort**: 2 sprints

---

## Shared Infrastructure Needs

### For Phase 1 (F-1, F-2, F-3):

- No new infrastructure — all backend APIs exist
- May need chart library for F-1

### For Phase 2 (F-4, F-5, F-6):

- New service files following existing pattern
- New page/feature following Architecture Map conventions
- F-6 may need new feature module (src/features/autonomous/)

### For Phase 3+ (F-7 through F-12):

- New feature modules
- Database migration (F-11)
- Auth provider replacement (F-10)
- WebSocket room management updates (F-12)
