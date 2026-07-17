# Updated Architecture Map

**Project**: Roblox AI Studio Control Center  
**Generated**: July 15, 2026 (Sprint 7)  
**Source**: Verified against actual repository structure  
**Status**: CURRENT ✅

---

## Entry Point Flow

```
main.tsx
  → Providers (app/providers/index.tsx)
    → App.tsx
      → AppRouter (app/router/index.tsx)
        → Pages (src/pages/*.tsx)
          → Features / Shared UI
```

### Detailed Boot Sequence

1. **main.tsx** — Vite entry point, mounts React root
2. **app/providers/index.tsx** — Composes all context providers (Auth, Toast)
3. **App.tsx** — Root component, renders router
4. **app/router/index.tsx** — React Router with 11 routes (7 lazy-loaded)
5. **Pages** — Each page renders using shared/ui components and services

---

## Layer Hierarchy

```
┌─────────────────────────────────────────────────────┐
│  app/          — Application shell & configuration  │
│  (router, providers, config)                        │
├─────────────────────────────────────────────────────┤
│  pages/        — Route-level page components        │
│  (11 pages, lazy-loaded where appropriate)          │
├─────────────────────────────────────────────────────┤
│  features/     — Feature modules                    │
│  (workspace/ with 25 components, hooks, types)      │
├─────────────────────────────────────────────────────┤
│  shared/       — Shared UI, types, events           │
│  (ui/, constants/, contracts/, events/, types)      │
├─────────────────────────────────────────────────────┤
│  services/     — Backend API service layer          │
│  (10 service modules + base API client)             │
├─────────────────────────────────────────────────────┤
│  providers/    — Global state (Auth, Toast)         │
│  hooks/        — Global hooks (useSocket)           │
│  utils/        — Utility functions (cn)             │
└─────────────────────────────────────────────────────┘
```

---

## Dependency Direction

Imports flow **downward** — upper layers import from lower layers. Never the reverse.

```
app/ ──────→ pages/ ──────→ features/ ──────→ shared/
                │                │                │
                ├──→ shared/ui   ├──→ shared/ui   │
                ├──→ services/   ├──→ services/   │
                ├──→ providers/  │                │
                └──→ hooks/      └──→ hooks/      │
                                                  │
services/ ────────────────────────→ shared/events │
                                   shared/contracts
```

### Import Rules

| From       | Can Import                                      |
| ---------- | ----------------------------------------------- |
| app/       | pages, providers, shared, services              |
| pages/     | shared/ui, services, providers, hooks, features |
| features/  | shared/ui, services, hooks                      |
| shared/ui  | shared/types, utils                             |
| services/  | shared/events, shared/contracts, shared/types   |
| providers/ | services, shared/types                          |
| hooks/     | services, shared/types                          |

### Forbidden Imports

- ❌ shared/ → pages/
- ❌ shared/ → features/
- ❌ services/ → pages/
- ❌ services/ → features/
- ❌ features/ → pages/

---

## Import Strategy

### Path Aliases

All cross-directory imports use the `@/` path alias:

```typescript
// Cross-directory (uses @/ alias)
import { Button } from "@/shared/ui";
import { useAuth } from "@/providers/AuthContext";
import { projectService } from "@/services/projectService";

// Intra-feature (uses relative paths)
import { AgentCard } from "./components/AgentCard";
import { usePipelineStream } from "./hooks";
```

**Configuration**:

- `tsconfig.json`: `"paths": { "@/*": ["./src/*"] }`
- `vite.config.ts`: `resolve.alias: { '@': path.resolve(__dirname, './src') }`

---

## State Management

### Global State (Context-based)

| Provider      | Location                    | Purpose                                       |
| ------------- | --------------------------- | --------------------------------------------- |
| AuthContext   | providers/AuthContext.tsx   | Authentication state, user data, login/logout |
| ToastProvider | providers/ToastProvider.tsx | Toast notifications, success/error messages   |

### Local State

Each page and feature component manages its own state via React hooks (`useState`, `useEffect`, `useReducer`).

### Data Fetching

- **Services layer** handles all API communication
- **Pages** call services on mount or user action
- **No global store** (Redux, Zustand) — context + local state pattern

---

## Data Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────────────┐
│  Pages   │────→│   Services   │────→│  Backend API         │
│          │←────│              │←────│  (localhost:5000)    │
└──────────┘     └──────────────┘     └─────────────────────┘
     │                  │
     │                  ├── REST API (axios)
     │                  └── WebSocket (socket.io)
     │
     ├── AuthContext (user state)
     ├── ToastProvider (notifications)
     └── Local state (component-level)
```

### API Communication

| Pattern   | Module         | Purpose                                        |
| --------- | -------------- | ---------------------------------------------- |
| REST      | api.ts (axios) | CRUD operations, data fetching                 |
| WebSocket | socket.ts      | Real-time pipeline updates, live console       |
| Events    | shared/events  | Internal event bus for decoupled communication |

### Backend Endpoints (localhost:5000)

- `/api/projects` — Project management
- `/api/ai/*` — AI engine operations
- `/api/studio/*` — Studio bridge communication
- `/api/system/*` — System health and status
- `/api/generation/*` — Generation monitoring
- `/api/concepts/*` — Concept generation

---

## Route Architecture

```
/ ──────────────── LandingPage (eager)
/login ─────────── LoginPage (eager)
/register ──────── RegisterPage (eager)
/dashboard ─────── DashboardPage (lazy) ─── uses shared/ui/dashboard
/new-project ───── NewProjectPage (lazy)
/projects ──────── ProjectsPage (lazy) ──── uses shared/ui/data
/projects/:id ──── WorkspacePage (lazy) ─── uses features/workspace
/settings ──────── SettingsPage (lazy)
/ai-engine ─────── AiStudioPage (lazy) ─── uses shared/ui/ai
/plugin-manager ── PluginManagerPage (lazy) uses shared/ui/system
/analytics ─────── AnalyticsPage (lazy)
```

### Lazy Loading Strategy

- **Eager**: Landing, Login, Register (first-paint pages)
- **Lazy**: All authenticated/heavy pages (React.lazy + Suspense)

---

## Technology Stack

| Layer     | Technology           |
| --------- | -------------------- |
| Framework | React 18             |
| Language  | TypeScript (strict)  |
| Build     | Vite                 |
| Styling   | Tailwind CSS         |
| Routing   | React Router v6      |
| HTTP      | Axios                |
| WebSocket | Socket.IO Client     |
| Utilities | clsx, tailwind-merge |

---

## Verification

- ✅ Entry point flow verified via main.tsx → App.tsx → router
- ✅ Layer hierarchy matches directory structure
- ✅ Import direction verified via @/ alias usage
- ✅ All routes verified in app/router/index.tsx
- ✅ State management verified in providers/
- ✅ No circular dependencies detected
