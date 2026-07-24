# FRONTEND MASTER ARCHITECTURE

**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Phase**: FE-5 - Documentation

---

## EXECUTIVE SUMMARY

This document describes the master architecture for the new Feature-Sliced Design (FSD) frontend. It covers component architecture, data flow, API contracts, state management, integration points, and future roadmap.

**Architecture Status**: ✅ DESIGNED

- **Pattern**: Feature-Sliced Design (FSD)
- **Tech Stack**: React 18.3.1, TypeScript 5.6.3, Vite 5.4.10, TanStack Query, Zustand, Tailwind CSS
- **Location**: `frontend-new/`

---

## 1. COMPONENT ARCHITECTURE

### 1.1 FSD Layers

```
src/
├── app/          # App-level configuration
│   ├── providers/ # React providers (QueryClient, etc.)
│   ├── router/    # Routing configuration
│   ├── store/     # Global state (Zustand)
│   └── config/    # App configuration
├── pages/        # Page components (routes)
├── widgets/      # Composite UI components
├── features/     # Feature-specific logic
├── entities/     # Business entities
└── shared/       # Shared utilities
```

### 1.2 Layer Responsibilities

**app/** - Application Level

- Providers: QueryClient, Router, Theme
- Router: Route definitions
- Store: Global state (Zustand)
- Config: App-wide configuration

**pages/** - Page Level

- Route components
- Page layouts
- Page-specific logic

**widgets/** - Widget Level

- Composite UI components
- Reusable page sections
- Business logic for specific UI patterns

**features/** - Feature Level

- Feature-specific business logic
- Feature-specific UI components
- Feature-specific hooks

**entities/** - Entity Level

- Business entities
- Entity-specific types
- Entity-specific API calls

**shared/** - Shared Level

- API clients
- UI components (buttons, inputs, etc.)
- Custom hooks
- TypeScript types
- Utility functions
- Constants

---

## 2. DATA FLOW

### 2.1 Server State Flow

```
User Action → Component → TanStack Query Hook → API Client → Backend
                ↓
            Loading State
                ↓
            Data/Error
                ↓
            Component Update
```

**TanStack Query Integration**:

- QueryClientProvider wraps app
- useQuery for data fetching
- useMutation for data mutations
- Automatic caching and revalidation
- Optimistic updates

### 2.2 Global State Flow

```
User Action → Component → Zustand Store → Component Update
```

**Zustand Integration**:

- useAppStore for global state
- User, activeProject, plugin state
- AI session state
- Sync state

### 2.3 Event Flow

```
Backend → Socket.io → Event Handler → Store Update → Component Update
```

**Socket.io Integration**:

- Real-time updates
- Connection status
- Generation progress
- Sync status

---

## 3. API CONTRACTS

### 3.1 Projects API

**Base**: `/api/projects`

**Endpoints**:

- `GET /api/projects` - List projects
- `GET /api/projects/:id` - Get project
- `POST /api/projects` - Create project
- `DELETE /api/projects/:id` - Delete project
- `GET /api/projects/:id/history` - Get generation history

**Types**:

```typescript
interface Project {
  id: string;
  name: string;
  type: string;
  genre: string;
  description?: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateProjectInput {
  name: string;
  type: string;
  genre: string;
  description?: string;
}
```

### 3.2 AI API

**Base**: `/api/concept`

**Endpoints**:

- `POST /api/concept/experience/generate-direct` - Start generation
- `GET /api/concept/experience/status/:pipelineId` - Get status
- `GET /health` - Get active provider

**Types**:

```typescript
interface PipelineResult {
  success: boolean;
  executionId?: string;
  pipelineId?: string;
  status?: string;
  error?: string;
}
```

### 3.3 Plugin API

**Base**: `/api/studio`

**Endpoints**:

- `GET /api/studio/status` - Connection status
- `POST /api/studio/connect` - Connect
- `POST /api/studio/disconnect` - Disconnect
- `POST /api/studio/heartbeat` - Heartbeat
- `POST /api/studio/sync/project` - Request sync
- `POST /api/studio/sync/artifacts` - Request artifacts
- `GET /api/studio/sync/status` - Sync status

**Types**:

```typescript
interface StudioStatusData {
  connected: boolean;
  clientCount: number;
  sessionCount: number;
  clients: Array<StudioClient>;
}

interface SyncStatusData {
  lastSyncTimestamp: number | null;
  pendingChanges: number;
  conflictCount: number;
  currentVersion: string;
  projectId: string | null;
}
```

### 3.4 Artifacts API

**Base**: `/api/artifacts`

**Endpoints**:

- `GET /api/artifacts` - List artifacts
- `GET /api/artifacts/:id` - Get artifact
- `DELETE /api/artifacts/:id` - Delete artifact

**Types**:

```typescript
interface Artifact {
  id: string;
  type: string;
  name: string;
  stage: string;
  size: number;
  hash: string;
  version: number;
  createdAt: number;
  reviewStatus: string;
}
```

---

## 4. STATE MANAGEMENT

### 4.1 Global State (Zustand)

**Store**: `app/store/index.ts`

**State**:

```typescript
interface AppState {
  user: User | null;
  activeProject: Project | null;
  setUser: (user: User | null) => void;
  setActiveProject: (project: Project | null) => void;
}
```

**Usage**:

```typescript
const { user, activeProject, setUser, setActiveProject } = useAppStore();
```

### 4.2 Server State (TanStack Query)

**Query Client**: Configured in `main.tsx`

**Queries**:

```typescript
// Projects
const { data: projects } = useQuery({
  queryKey: ["projects"],
  queryFn: listProjects,
});

// Project
const { data: project } = useQuery({
  queryKey: ["project", id],
  queryFn: () => getProject(id),
});

// Studio Status
const { data: studioStatus } = useQuery({
  queryKey: ["studio-status"],
  queryFn: getStudioStatus,
  refetchInterval: 5000,
});
```

**Mutations**:

```typescript
const createProjectMutation = useMutation({
  mutationFn: createProject,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  },
});
```

---

## 5. INTEGRATION POINTS

### 5.1 Backend Integration

**API Proxy**: Vite proxy configuration

```typescript
proxy: {
  "/api": {
    target: "http://localhost:5000",
    changeOrigin: true,
  },
}
```

**Socket.io**: Direct connection

```typescript
import { io } from "socket.io-client";
const socket = io("http://localhost:5000");
```

### 5.2 Roblox Studio Integration

**Protocol**: WebSocket + HTTP
**Endpoints**: `/api/studio/*`
**Real-time**: Socket.io events

### 5.3 AI Engine Integration

**Protocol**: HTTP + WebSocket
**Endpoints**: `/api/concept/*`
**Real-time**: Generation progress via Socket.io

---

## 6. FUTURE ROADMAP

### 6.1 Short Term (Next Sprint)

**Authentication**:

- Implement real JWT authentication
- Add login/register pages
- Add protected routes

**UI Components**:

- Add shadcn/ui components
- Create design system
- Add theme support

**Core Screens**:

- Implement Dashboard with real data
- Implement Projects page with CRUD
- Implement AI Studio with prompt/response
- Implement Plugin Manager with connection controls
- Implement Analytics with charts

### 6.2 Medium Term (Next Quarter)

**Features**:

- AI generation with real-time progress
- Project sync with artifact explorer
- Code review with diff viewer
- Deployment with version control

**Performance**:

- Add code splitting
- Add lazy loading
- Optimize bundle size

### 6.3 Long Term (Next Year)

**Advanced Features**:

- AI agent orchestration
- Multi-project management
- Advanced analytics
- Team collaboration

**Infrastructure**:

- CI/CD pipeline
- Monitoring
- Error tracking

---

## 7. QUALITY REQUIREMENTS

### 7.1 TypeScript

**Strict Mode**: ✅ Enabled

- No `any` types
- No unused variables
- No unused parameters
- Strict null checks

### 7.2 Code Quality

**ESLint**: ✅ Configured

- Max warnings: 0
- React rules
- TypeScript rules

**Prettier**: ✅ Configured

- Consistent formatting
- Automatic formatting on save

### 7.3 Testing

**Vitest**: ✅ Configured

- Unit tests for hooks
- Integration tests for API
- E2E tests for critical flows

### 7.4 Error Handling

**Error Boundaries**: ✅ Required

- Wrap all routes
- Log errors
- Show user-friendly error messages

**API Errors**: ✅ Centralized

- ApiError class
- Global error handler
- User-friendly error messages

---

## 8. MIGRATION STRATEGY

### 8.1 Migration Phases

**Phase FE-0**: ✅ Audit

- Analyze current frontend
- Document structure
- Identify risks

**Phase FE-1**: ✅ Structure

- Create FSD structure
- Set up configuration
- Install dependencies

**Phase FE-2**: ✅ API Integration

- Create typed API clients
- Add TanStack Query
- Add Zustand

**Phase FE-3**: ⏸️ Core Screens

- Implement Dashboard
- Implement Projects
- Implement AI Studio
- Implement Plugin Manager
- Implement Analytics

**Phase FE-4**: ⏸️ State Management

- Implement global stores
- Implement query hooks
- Implement mutation hooks

**Phase FE-5**: ⏸️ Documentation

- Create architecture docs
- Create migration report
- Update README

**Phase FE-6**: ⏸️ Cleanup

- Move old frontend to frontend-legacy
- Validate new frontend
- Remove old frontend

### 8.2 Validation Steps

**Before Cleanup**:

1. Build new frontend
2. Test all routes
3. Test API connections
4. Test state management
5. Test error handling

**After Cleanup**:

1. Update package.json
2. Update build scripts
3. Update CI/CD
4. Update documentation

---

## 9. SUMMARY

### 9.1 Architecture Benefits

**FSD Benefits**:

- Clear separation of concerns
- Scalable structure
- Easy to maintain
- Easy to test

**Tech Stack Benefits**:

- Modern React patterns
- Type-safe API calls
- Efficient state management
- Fast development with Vite

### 9.2 Next Steps

**Immediate**:

1. Install dependencies (npm install)
2. Implement core screens
3. Implement state management hooks
4. Test API connections

**After Testing**:

1. Move old frontend to frontend-legacy
2. Validate new frontend
3. Remove old frontend
4. Update documentation

---

**Architecture Status**: ✅ DESIGNED
**Next Phase**: FE-3 - Create Core Screens
**Owner**: Architecture Team
