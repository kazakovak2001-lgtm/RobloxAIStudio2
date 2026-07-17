# AI Project Controller — Implementation Plan

**Date**: July 17, 2026  
**Based on**: AI_CONTROLLER_AUDIT.md findings  
**Principle**: Extend existing systems, zero duplication

---

## Architecture Decision

The AI Project Controller will NOT be a separate system. It will be:

- 3 new `BaseAgentV2` implementations (using existing agent infrastructure)
- 1 extension to existing `KnowledgeEngine` (codebase knowledge layer)
- 1 GCP Secret Manager provider (following existing provider pattern)
- 1 new API route (following existing route registration)

---

## Implementation Components

### Component 1: ArchitectureAgent

**File**: `server/src/agents/implementations/ArchitectureAgent.ts`  
**Extends**: `BaseAgentV2` (existing)  
**Registers with**: `CapabilityRegistry` (existing)

**Responsibilities**:

- Run `ImportBoundaryValidator.scanProject()` (existing)
- Run `GovernancePolicyEngine.evaluatePolicies()` (existing)
- Analyze results with LLM to provide natural language recommendations
- Detect tech debt patterns from dependency graph
- Report architecture health score

**Reuses**:

- `server/src/core/architecture/ImportBoundaryValidator.ts`
- `server/src/governance/GovernancePolicyEngine.ts`
- `architecture.manifest.json`

---

### Component 2: CodeReviewAgent

**File**: `server/src/agents/implementations/CodeReviewAgent.ts`  
**Extends**: `BaseAgentV2` (existing)

**Responsibilities**:

- Analyze code changes (diff-based input)
- Check against Engineering Handbook rules
- Identify anti-patterns
- Suggest improvements
- Quality scoring

**Reuses**:

- Engineering Handbook rules (parsed from `docs/ENGINEERING_HANDBOOK.md`)
- LLM provider from `LLMProviderFactory` (existing)

---

### Component 3: DuplicationDetectionAgent

**File**: `server/src/agents/implementations/DuplicationDetectionAgent.ts`  
**Extends**: `BaseAgentV2` (existing)

**Responsibilities**:

- Before creating new functionality: search existing codebase
- Query CodebaseKnowledge for similar components/services
- Return existing alternatives if found
- Flag potential duplicates

**Reuses**:

- `ImportBoundaryValidator` (for file scanning)
- `CodebaseKnowledge` (new extension to existing KnowledgeEngine)

---

### Component 4: CodebaseKnowledge Extension

**File**: `server/src/knowledge/CodebaseKnowledge.ts`  
**Extends**: Existing `KnowledgeEngine` pattern

**Responsibilities**:

- Index source files by type (component, service, route, hook, agent)
- Store file metadata (path, exports, dependencies, last modified)
- Query by functionality description
- Return relevant files for a given task

**Knowledge categories**:

- `architecture` — system structure, layers, domains
- `components` — frontend components with their purposes
- `services` — backend services and their APIs
- `decisions` — why changes were made (from DECISION_LOG.md)

**Does NOT duplicate**: Existing `PatternRepository`, `PromptRankingRepository`, `SimilarityEngine`

---

### Component 5: GCP Secret Provider

**File**: `server/src/cloud/secrets/GCPSecretProvider.ts`

**Responsibilities**:

- Load secrets from Google Cloud Secret Manager
- Fallback to `process.env` when GCP is unavailable (development mode)
- Cache secrets in memory for performance
- Support secret rotation

**Configuration**:

- Project: `roblox-ai-studio-cloud`
- Service Account: `ai-project-controller@roblox-ai-studio-cloud.iam.gserviceaccount.com`
- Activation: `SECRET_PROVIDER=gcp` env var (default: `env` for local dev)

---

### Component 6: Controller API Route

**File**: `server/src/routes/controller.ts`  
**Mount point**: `/api/controller`  
**Registration**: In `server/src/index.ts` (alongside existing route registrations)

**Endpoints**:

- `GET /api/controller/health` — Controller agent status
- `POST /api/controller/review` — Trigger code review on provided diff
- `POST /api/controller/architecture/scan` — Run architecture analysis
- `POST /api/controller/duplicates/check` — Check for existing similar functionality
- `GET /api/controller/knowledge/query` — Query codebase knowledge

---

## Files Affected

### New Files (6-8 total)

| File                                                             | Purpose                       |
| ---------------------------------------------------------------- | ----------------------------- |
| `server/src/agents/implementations/ArchitectureAgent.ts`         | Architecture validation agent |
| `server/src/agents/implementations/CodeReviewAgent.ts`           | Code review agent             |
| `server/src/agents/implementations/DuplicationDetectionAgent.ts` | Duplication detection agent   |
| `server/src/knowledge/CodebaseKnowledge.ts`                      | Codebase indexing extension   |
| `server/src/cloud/secrets/GCPSecretProvider.ts`                  | GCP Secret Manager provider   |
| `server/src/routes/controller.ts`                                | Controller API endpoints      |

### Modified Files (2-3, minimal changes)

| File                                      | Change                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `server/src/index.ts`                     | Add route registration: `app.use("/api/controller", createControllerRouter())` |
| `server/src/agents/core/AgentRegistry.ts` | Register 3 new agents (if not auto-discovered)                                 |
| `.env.example`                            | Add `SECRET_PROVIDER=env` and GCP config comments                              |

### NOT Modified

- No existing agent implementations
- No existing knowledge engine files
- No existing governance system
- No existing validation scripts
- No existing frontend code
- No existing documentation files (extended, not overwritten)

---

## Risks

| Risk                            | Severity | Mitigation                                                               |
| ------------------------------- | -------- | ------------------------------------------------------------------------ |
| LLM dependency for review agent | MEDIUM   | Stub mode returns basic analysis without LLM                             |
| GCP SDK dependency size         | LOW      | Optional dependency, only loaded when `SECRET_PROVIDER=gcp`              |
| Codebase indexing performance   | LOW      | Index on server startup, cache in memory                                 |
| Breaking existing tests         | LOW      | New files only, no existing file modifications beyond route registration |

---

## Migration Path

1. **Phase A**: Create `CodebaseKnowledge.ts` — extends knowledge system
2. **Phase B**: Create 3 agent implementations — extends agent system
3. **Phase C**: Create controller route — exposes agents via API
4. **Phase D**: Create GCP Secret Provider — production secret management
5. **Phase E**: Register route in `index.ts` — single-line addition

Each phase is independently deployable and testable.

---

## Validation

After implementation:

- `npx tsc --noEmit` — TypeScript compilation
- `npm run validate:arch` — Architecture boundary check (new files must comply)
- `npm run validate:boundaries` — Import boundary check
- `npm run test` — Existing test suite must pass
- `npx vite build` — Frontend build (unaffected, but verify)

---

## Not In Scope

These are explicitly excluded from this implementation:

- Frontend UI for the controller (can be added later as a new page)
- Modifying the existing Knowledge Base page/API
- Replacing existing validation scripts
- Changing the existing agent orchestration flow
- Database schema changes (in-memory first, persist via existing storage provider later)
