# Architecture Rules

**Reference:** See `AI_DEVELOPMENT_GOVERNANCE.md` Section 2 for the canonical rules.

---

## Dual-Root Model

```
src/           → Frontend (React SPA, Vite)
server/src/    → Backend (Node.js, Express, AI Compiler)
shared/        → Shared types and contracts (NO implementations)
```

These three roots must never import from each other directly.

---

## Backend Domain Structure

```
server/src/
├── core/           → Foundation (architecture enforcement, observability, analytics, agents)
├── agents/         → AI agent registry and implementations
├── ai/             → LLM provider layer
├── api/            → Versioned API gateway
├── artifacts/      → Game artifact builder
├── assembly/       → Roblox project assembly
├── cloud/          → Cloud network layer
├── collaboration/  → AI agent collaboration
├── common/         → Shared utilities and middleware
├── compiler/       → Production compiler API
├── distributed/    → Distributed execution (job queue, workers)
├── economy/        → Economy simulation
├── evaluation/     → Quality evaluation engine
├── eventsource/    → Event-sourced persistence
├── execution/      → Legacy execution (deprecated aiPipelineIntegrator)
├── export/         → Roblox project export
├── generation/     → Game generation pipeline
├── governance/     → CI/CD governance policies
├── lifecycle/      → Game lifecycle management
├── memory/         → Project memory engine
├── pipeline/       → Pipeline types
├── planning/       → Autonomous planning (PlanExecutor lives here)
├── plugins/        → Plugin SDK
├── projects/       → Project services
├── providers/      → External provider adapters
├── routes/         → HTTP API routes
├── runtime/        → Runtime execution layer (v1.8+)
├── simulation/     → Game simulation
├── socket/         → WebSocket/SSE streaming
├── studio/         → Roblox Studio integration
├── types/          → Backend type definitions
├── validation/     → Schema validation
├── world/          → World intelligence
└── _quarantine/    → Deprecated modules (excluded from build)
```

---

## Boundary Rules

Defined in `architecture.manifest.json`:

- **Forbidden:** `simulation/economy/world` → `ai` (use agent interfaces)
- **Forbidden:** `routes` → `cloud` (use service layer)
- **Forbidden:** `*` → `_quarantine` (quarantined code is dead)
- **Hard ban:** `aiPipelineIntegrator` import in runtime code

---

## Execution Architecture

```
PlannerEngine → PlanExecutor → Agent Nodes → Evaluation → Memory → Artifacts
```

- `PlanExecutor` is the ONLY canonical runtime execution engine
- `RuntimeExecutionController` wraps PlanExecutor with lifecycle management (v1.8+)
- `aiPipelineIntegrator` is deprecated — preserved only for `PIPELINE_STAGES` constant

---

## Enforcement Tools

| Tool                               | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `scripts/validate-architecture.ts` | Dual-root structure validation             |
| `scripts/validate-boundaries.ts`   | Import boundary firewall (manifest-driven) |
| `scripts/scan-imports.ts`          | Full dependency graph scanner              |
| `.eslintrc.json`                   | ESLint rules blocking forbidden imports    |
| `RuntimeBoundaryGuard`             | Startup-time structure validation          |
