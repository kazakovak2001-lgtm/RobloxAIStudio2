# Project Architecture Map

**Project**: Roblox AI Studio Control Center  
**Date**: July 13, 2026  
**Scope**: Complete architecture map

---

## Executive Summary

The Roblox AI Studio Control Center is a full-stack application consisting of a React/TypeScript frontend, Node.js/Express backend, and Roblox Studio Lua plugin. The architecture follows Clean Architecture principles with clear separation between frontend, backend, and plugin layers.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Frontend (React/TypeScript)                  │   │
│  │  - Pages (Dashboard, AI Studio, Projects, etc.)         │   │
│  │  - Components (shared/ui, src/components)               │   │
│  │  - Features (Workspace, etc.)                            │   │
│  │  - State (Contexts, Hooks)                               │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
│  ┌─────────────────────┴───────────────────────────────────┐   │
│  │              Build Layer (Vite)                           │   │
│  │  - TypeScript compilation                                │   │
│  │  - Bundling                                              │   │
│  │  - Code splitting                                        │   │
│  └─────────────────────┬───────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         │ HTTP/WebSocket
                         │
┌────────────────────────┼─────────────────────────────────────┐
│                         ↓                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              API Gateway / Express Server                │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  - Routes (REST API)                                    │   │
│  │  - Middleware (Auth, Rate Limiting, CORS)               │   │
│  │  - WebSocket Server (Socket.io)                          │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
│  ┌─────────────────────┴───────────────────────────────────┐   │
│  │              Service Layer                               │   │
│  │  - Game Generation Service                               │   │
│  │  - Blueprint Validator                                  │   │
│  │  - Pipeline Orchestrator                                 │   │
│  │  - Agent Coordinator                                     │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
│  ┌─────────────────────┴───────────────────────────────────┐   │
│  │              Execution Layer                             │   │
│  │  - AI Pipeline Integrator                                │   │
│  │  - Blueprint Assembler                                  │   │
│  │  - Retry Policy Executor                                │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
│  ┌─────────────────────┴───────────────────────────────────┐   │
│  │              AI Provider Layer                           │   │
│  │  - OpenAI                                                │   │
│  │  - Anthropic                                             │   │
│  │  - Groq                                                  │   │
│  │  - Custom Providers                                      │   │
│  └─────────────────────┬───────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         │
┌────────────────────────┼─────────────────────────────────────┐
│                         ↓                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Data Layer                                  │   │
│  │  - In-Memory Cache                                      │   │
│  │  - File Storage                                         │   │
│  │  - Database (Future)                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         PLUGIN LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Roblox Studio Plugin (Lua)                  │   │
│  │  - Plugin Entry Point                                    │   │
│  │  - Command Handlers                                     │   │
│  │  - UI Components                                         │   │
│  │  - Service Layer                                         │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
│                        │ WebSocket                             │
│                        │                                        │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         │
┌────────────────────────┴─────────────────────────────────────┐
│              BACKEND SERVER (Express/Node.js)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture

### 2.1 Directory Structure

```
src/
├── pages/              # Page components (22 files)
├── components/         # Reusable components
│   ├── layout/        # Layout components (Navbar, Sidebar)
│   └── ui/           # UI components (Button, Card, etc.)
├── features/          # Feature modules
│   └── workspace/    # Workspace feature (27 files)
├── layouts/           # Page layouts (AppLayout)
├── services/          # API services (11 files)
├── hooks/             # React hooks (useSocket)
├── contexts/          # React contexts (AuthContext, ToastProvider)
├── utils/             # Utilities (cn)
└── types/             # TypeScript types

shared/
└── ui/                # Shared UI components (UX-3)
    ├── layout/        # Layout components (5 files)
    ├── dashboard/     # Dashboard widgets (5 files)
    ├── ai/           # AI components (5 files)
    ├── data/         # Data components (1 file)
    ├── projects/     # Projects components (1 file)
    └── system/       # System components (3 files)
```

### 2.2 Component Architecture

**Component Hierarchy**:

```
App
├── AuthContext
├── ToastProvider
└── Router
    ├── LandingPage
    ├── LoginPage
    ├── RegisterPage
    ├── DashboardPageNew (UX-3)
    │   └── AppShell
    │       ├── Sidebar
    │       ├── TopBar
    │       ├── Workspace
    │       │   └── Dashboard Widgets
    │       └── StatusBar
    ├── ProjectsPageNew (UX-3)
    │   └── AppShell
    │       └── Workspace
    │           └── ProjectExplorer
    │               └── TreeView
    ├── AiStudioPage (UX-3)
    │   └── AppShell
    │       └── Workspace
    │           ├── AIChatPanel
    │           ├── PromptInput
    │           ├── AgentCard
    │           ├── CodeDiffViewer
    │           └── GenerationHistory
    ├── PluginManagerPage (UX-3)
    │   └── AppShell
    │       └── Workspace
    │           ├── ConnectionBadge
    │           ├── StatusIndicator
    │           └── SyncProgress
    ├── AnalyticsPage (UX-3)
    │   └── AppShell
    │       └── Workspace
    ├── ProjectDetailPage
    │   └── AppLayout (Legacy)
    │       ├── Sidebar
    │       ├── Navbar
    │       └── Workspace Feature
    └── SettingsPage
```

### 2.3 State Management

**Contexts**:

- AuthContext: Authentication state
- ToastProvider: Toast notifications

**Hooks**:

- useSocket: WebSocket connection management
- usePipelineStream: Pipeline streaming (workspace)

**State Flow**:

```
User Action → Component State → Context/Service → API → Backend
```

---

## 3. Backend Architecture

### 3.1 Directory Structure

```
server/src/
├── agents/             # AI agent system (30 files)
│   ├── collaboration/  # Agent collaboration
│   ├── core/          # Base agent implementations
│   ├── implementations/# Specific agents
│   └── orchestrator/  # Agent orchestration
├── ai/                 # AI services (39 files)
├── analytics/          # Analytics services (5 files)
├── api/                # API routes (8 files)
├── artifacts/          # Artifact management (2 files)
├── assembly/           # Assembly services (15 files)
├── assets/             # Asset management (8 files)
├── cloud/              # Cloud services (5 files)
├── collaboration/      # Collaboration features (7 files)
├── common/             # Common utilities (2 files)
├── compiler/           # Compiler services (8 files)
├── core/               # Core functionality (24 files)
├── distributed/        # Distributed computing (10 files)
├── domain/             # Domain models (6 files)
├── economy/            # Economy system (5 files)
├── evaluation/         # Evaluation services (9 files)
├── execution/          # Execution engine (9 files)
├── export/             # Export services (4 files)
├── generation/         # Generation engine (73 files)
├── governance/         # Governance (5 files)
├── integration/        # Integration services (5 files)
├── jobs/               # Job management (10 files)
├── knowledge/          # Knowledge base (6 files)
├── lifecycle/          # Lifecycle management (6 files)
├── lua/                # Lua services (17 files)
├── memory/             # Memory management (20 files)
├── orchestrator/       # Orchestration (3 files)
├── pipeline/           # Pipeline management (23 files)
├── planning/           # Planning services (10 files)
├── platform/           # Platform services (24 files)
├── playtest/           # Playtest features (4 files)
├── plugins/            # Plugin system (5 files)
├── projects/           # Project management (14 files)
├── providers/          # AI providers (23 files)
├── repair/             # Repair services (5 files)
├── routes/             # Route definitions (27 files)
├── runtime/            # Runtime services (7 files)
├── simulation/         # Simulation (5 files)
├── socket/             # Socket services (2 files)
├── studio/             # Studio integration (37 files)
├── types/              # Type definitions (5 files)
├── ui-gen/             # UI generation (8 files)
├── validation/         # Validation (1 file)
└── world/              # World management (6 files)
```

### 3.2 Layer Architecture

**Clean Architecture Layers**:

1. **Routes Layer** (server/src/routes/)
   - HTTP endpoint definitions
   - Request/response handling
   - Authentication middleware

2. **Service Layer** (server/src/*Service.ts)
   - Business logic
   - Orchestration
   - Transaction management

3. **Execution Layer** (server/src/execution/)
   - Pipeline execution
   - Blueprint assembly
   - Retry logic

4. **Provider Layer** (server/src/providers/)
   - AI provider abstractions
   - OpenAI, Anthropic, Groq integrations

5. **Data Layer** (server/src/cache/, server/src/storage/)
   - In-memory caching
   - File persistence
   - Future: Database integration

### 3.3 Key Services

**Game Generation Service**:

- Blueprint creation
- Pipeline orchestration
- Result validation

**Agent System**:

- Agent registry
- Agent coordination
- Message bus

**Pipeline System**:

- Step execution
- Parallel/sequential execution
- Error handling

---

## 4. Plugin Architecture

### 4.1 Directory Structure

```
studio-plugin/
├── plugin.lua          # Main plugin entry point
├── src/
│   ├── commands/       # Plugin commands
│   ├── core/          # Core functionality
│   ├── legacy/        # Legacy code
│   ├── services/      # Plugin services
│   ├── ui/            # UI components
│   └── utils/         # Utilities
└── assets/            # Plugin assets
```

### 4.2 Plugin Communication

**Communication Flow**:

```
Roblox Studio → Plugin → WebSocket → Backend Server → Frontend
```

**Protocol**:

- WebSocket-based real-time communication
- JSON message format
- Event-driven architecture

---

## 5. Shared Architecture

### 5.1 Shared Code

```
shared/
├── contracts/         # Shared contracts
├── events/            # Shared event definitions
├── types.ts           # Shared TypeScript types
└── ui/                # Shared UI components (UX-3)
```

### 5.2 Type Sharing

**Shared Types**:

- Project types
- Agent types
- Blueprint types
- API response types

---

## 6. Communication Patterns

### 6.1 HTTP REST API

**Frontend → Backend**:

```
Frontend Service → HTTP Request → Express Route → Service → Response
```

**Key Endpoints**:

- `/api/projects/*` - Project management
- `/api/system/*` - System status
- `/api/ai/*` - AI generation
- `/api/studio/*` - Studio integration

### 6.2 WebSocket Communication

**Real-time Communication**:

```
Frontend (useSocket) → Socket.io Client → Socket.io Server → Event Handlers
```

**Events**:

- `generation:progress` - Generation progress updates
- `pipeline:step` - Pipeline step updates
- `studio:sync` - Studio sync events

### 6.3 Plugin Protocol

**Plugin → Backend**:

```
Plugin → WebSocket → Backend Service → Processing → Response
```

---

## 7. Data Flow

### 7.1 Game Generation Flow

```
User Prompt → Frontend → API → Backend
    ↓
Pipeline Orchestrator
    ↓
Agent System (Multiple Agents)
    ↓
AI Providers (OpenAI, etc.)
    ↓
Blueprint Assembly
    ↓
Validation
    ↓
Storage
    ↓
WebSocket Updates → Frontend
```

### 7.2 Project Management Flow

```
User Action → Frontend Service → API → Backend Service
    ↓
Project Repository (In-Memory)
    ↓
Response → Frontend
```

### 7.3 Synchronization Flow

```
Roblox Studio → Plugin → WebSocket → Backend
    ↓
Sync Service
    ↓
Project Repository
    ↓
WebSocket Updates → Frontend
```

---

## 8. Technology Stack

### 8.1 Frontend

| Technology       | Version | Purpose      |
| ---------------- | ------- | ------------ |
| React            | 18.3.1  | UI Framework |
| TypeScript       | 5.6.3   | Type Safety  |
| Vite             | 5.4.10  | Build Tool   |
| Tailwind CSS     | 3.4.16  | Styling      |
| React Router     | 6.21.0  | Routing      |
| Framer Motion    | 12.42.0 | Animations   |
| Lucide React     | 0.468.0 | Icons        |
| Socket.io Client | 4.8.3   | WebSocket    |

### 8.2 Backend

| Technology         | Version | Purpose       |
| ------------------ | ------- | ------------- |
| Node.js            | Latest  | Runtime       |
| Express            | 4.18.2  | Web Framework |
| TypeScript         | 5.6.3   | Type Safety   |
| Socket.io          | 4.8.3   | WebSocket     |
| Helmet             | 8.3.0   | Security      |
| Express Rate Limit | 8.5.2   | Rate Limiting |

### 8.3 Plugin

| Technology    | Version | Purpose         |
| ------------- | ------- | --------------- |
| Lua           | -       | Plugin Language |
| Roblox Studio | -       | Target Platform |

---

## 9. Security Architecture

### 9.1 Frontend Security

- Authentication via JWT tokens
- Secure HTTP-only cookies
- XSS protection via React
- CSRF protection via tokens

### 9.2 Backend Security

- Helmet.js for HTTP headers
- Rate limiting
- Input validation
- SQL injection prevention (future database)
- API key management

### 9.3 Plugin Security

- Plugin authentication
- Secure WebSocket connection
- Message validation
- Rate limiting

---

## 10. Deployment Architecture

### 10.1 Frontend Deployment

```
Vite Build → Static Files → CDN/Web Server
```

### 10.2 Backend Deployment

```
TypeScript Build → Node.js Server → Cloud Provider
```

### 10.3 Plugin Distribution

```
Lua Plugin → Roblox Marketplace / Direct Distribution
```

---

## 11. Scalability Architecture

### 11.1 Frontend Scalability

- Code splitting via Vite
- Lazy loading of routes
- Optimized bundle size
- CDN for static assets

### 11.2 Backend Scalability

- Stateless API design
- Horizontal scaling support
- Caching layer
- Queue-based job processing

### 11.3 AI Provider Scalability

- Provider abstraction layer
- Multiple provider support
- Load balancing
- Fallback mechanisms

---

## 12. Monitoring Architecture

### 12.1 Frontend Monitoring

- Error boundary logging
- Performance monitoring
- User analytics (future)

### 12.2 Backend Monitoring

- API logging
- Error tracking
- Performance metrics
- Resource monitoring

### 12.3 Plugin Monitoring

- Connection status
- Sync status
- Error reporting

---

## 13. Development Workflow

### 13.1 Frontend Development

```
Component Development → TypeScript Check → Build → Test → Deploy
```

### 13.2 Backend Development

```
Service Development → TypeScript Check → Build → Test → Deploy
```

### 13.3 Plugin Development

```
Lua Development → Test → Package → Distribute
```

---

## 14. Integration Points

### 14.1 Frontend-Backend Integration

- REST API endpoints
- WebSocket events
- Shared type definitions

### 14.2 Backend-Plugin Integration

- WebSocket protocol
- Message format
- Event definitions

### 14.3 Frontend-Plugin Integration

- Indirect via backend
- WebSocket events
- Status updates

---

## 15. Future Architecture Enhancements

### 15.1 Planned Enhancements

1. **Database Integration**
   - PostgreSQL for persistent storage
   - Redis for caching
   - Migration from in-memory storage

2. **Microservices**
   - Separate AI service
   - Separate plugin service
   - Separate analytics service

3. **Event Bus**
   - Kafka or RabbitMQ
   - Event-driven architecture
   - Improved scalability

4. **API Gateway**
   - Kong or AWS API Gateway
   - Centralized API management
   - Rate limiting and authentication

### 15.2 Architecture Debt

- In-memory storage needs database
- Monolithic backend needs decomposition
- Lack of comprehensive logging
- Limited monitoring capabilities

---

## 16. Architecture Decision Records

Key ADRs are documented in `docs/adr/`:

- Clean Architecture adoption
- In-memory storage decision
- WebSocket for real-time communication
- Plugin architecture
- AI provider abstraction
