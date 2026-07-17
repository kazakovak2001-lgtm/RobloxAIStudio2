# Architecture — v3.0

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface (React)                     │
│  Dashboard │ Workspace │ Projects │ New Project │ Settings   │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API + Socket.IO
┌─────────────────────────┴───────────────────────────────────┐
│                    Backend (Express + Node)                   │
├─────────────────────────────────────────────────────────────┤
│  Autonomous Orchestrator                                     │
│  ├── Domain Intelligence (12 genres, best practices)         │
│  ├── Knowledge Engine (patterns, similarity, learning)       │
│  ├── Game Architect (analysis, design, prompts)              │
│  ├── Multi-Agent Collaboration (8 roles, consensus)          │
│  ├── Pipeline Engine v2 (11 stages, persistence)             │
│  │   ├── Lua Generation (8 templates, validator)             │
│  │   ├── Asset Generation (23 assets, placeholders)          │
│  │   └── Experience Assembly (hierarchy, deps, manifest)     │
│  ├── Playtest Engine (rules, performance, scoring)           │
│  ├── Repair Engine (9 strategies, iteration loop)            │
│  └── Studio Sync (protocol, transfer, artifacts)             │
├─────────────────────────────────────────────────────────────┤
│  Observability Layer                                         │
│  ├── Event Bus                                               │
│  ├── Audit Store                                             │
│  └── Metrics Collector                                       │
├─────────────────────────────────────────────────────────────┤
│  Persistence Layer                                           │
│  ├── Pipeline Store (InMemory / File)                        │
│  ├── Project Repository                                      │
│  ├── Generation History                                      │
│  └── Artifact Store                                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Studio Protocol v1.0
┌─────────────────────────┴───────────────────────────────────┐
│              Roblox Studio Plugin (Lua)                       │
│  ApiClient │ ConnectionManager │ SyncManager │ UI │ Events   │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Server-authoritative pipeline** — All generation runs on the backend
2. **Async execution** — Pipeline starts immediately, clients poll for status
3. **Modular engines** — Each concern (lua, assets, playtest, repair) is independent
4. **Protocol-based Studio integration** — Versioned protocol for plugin communication
5. **Knowledge-driven generation** — Each run improves future generations
6. **Self-healing** — Automatic repair loop targets quality threshold

## Module Count

- Backend TypeScript modules: 80+
- Frontend components: 25+
- API endpoints: 50+
- Test files: 27
- Total tests: 307
