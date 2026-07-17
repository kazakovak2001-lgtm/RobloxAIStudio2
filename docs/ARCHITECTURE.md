# Roblox AI Studio - Game Generation Engine Architecture

**Version**: 1.3.3
**Last Updated**: 2026-07-13

## System Overview

The Game Generation Engine is a production-grade AI orchestration platform that transforms natural language prompts into complete, validated Roblox game blueprints. It follows **Clean Architecture** principles with strict separation of concerns.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│              NewProjectPage, WorkspaceEditor, etc.               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │ HTTP REST API + Socket.io │
        └─────────────┬─────────────┘
                      │
┌─────────────────────────────────────────────────────────────────┐
│              Express Server (Node.js) - server/src/              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Routes Layer (game-generation.ts)                              │
│  ├─ POST /api/projects/:id/blueprints                         │
│  ├─ GET /api/blueprints/:id                                  │
│  ├─ POST /api/projects/:id/generate                          │
│  ├─ GET /api/projects/:id/generation/stream (SSE)            │
│  └─ GET /api/projects/:id/generation/:execId/status          │
│                                                                 │
│ Service Layer                                                   │
│  ├─ GameGenerationService                                      │
│  │   ├─ createBlueprint()                                     │
│  │   ├─ startGeneration()                                     │
│  │   ├─ completeGeneration()                                  │
│  │   └─ getBlueprint()                                        │
│  │                                                             │
│  └─ BlueprintValidator                                        │
│      ├─ validate()                                            │
│      ├─ validateForGeneration()                               │
│      └─ validateForExport()                                   │
│                                                                 │
│ Data Access Layer                                               │
│  ├─ IBlueprintRepository (interface)                           │
│  │                                                             │
│  └─ InMemoryBlueprintRepository (implementation)               │
│      ├─ createBlueprint()                                     │
│      ├─ updateBlueprint()                                     │
│      ├─ saveVersion()                                         │
│      └─ recordExecution()                                     │
│                                                                 │
│ Cache Layer                                                     │
│  └─ BlueprintCache                                             │
│      ├─ get(blueprintId)         [O(1)]                       │
│      ├─ getByProjectId()         [O(1)]                       │
│      ├─ invalidate()             [O(1)]                       │
│      └─ cleanup()                [periodic]                   │
│                                                                 │
│ Streaming/Events Layer                                          │
│  ├─ StreamingUpdateHandler (SSE)                               │
│  │   ├─ registerClient()                                      │
│  │   ├─ sendEvent()                                           │
│  │   └─ broadcastEvent()                                      │
│  │                                                             │
│  └─ PipelineEventEmitter                                       │
│      ├─ emitStepStarted()                                     │
│      ├─ emitStepCompleted()                                   │
│      └─ emitPipelineCompleted()                               │
│                                                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────────┐
│          Execution Layer (server/src/execution/)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ AIPipelineIntegrator                                            │
│  ├─ createPipelineSteps()                                      │
│  ├─ executePipelineStage()                                     │
│  ├─ executePipeline()                                          │
│  ├─ executeSequential()                                        │
│  ├─ executeParallel()                                          │
│  └─ executeHybrid()                                            │
│                                                                 │
│ BlueprintAssembler                                              │
│  ├─ assembleBlueprint()                                        │
│  ├─ extractGameplay()                                          │
│  ├─ extractArchitecture()                                      │
│  ├─ extractUILayouts()                                         │
│  ├─ extractAssets()                                            │
│  └─ validateAssembled()                                        │
│                                                                 │
│ RetryPolicy & RetryPolicyExecutor                              │
│  ├─ executeWithRetry()                                         │
│  ├─ calculateBackoff()  [exponential + jitter]                │
│  └─ shouldRetry()                                              │
│                                                                 │
│ PipelineTypes (interfaces)                                      │
│  ├─ PipelineStep                                               │
│  ├─ WorkflowState                                              │
│  ├─ ExecutionQueueItem                                         │
│  └─ PipelineEvent                                              │
│                                                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────────┐
│              AI Agent Pipeline (agents/)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Orchestrator                                                    │
│  └─ runPipeline()  ──→ [Sequential agent chain]               │
│                                                                 │
│ Agent Pipeline Stages (7 agents)                               │
│  1. RequirementsAgent      [Parse prompt → requirements]       │
│  2. PlannerAgent           [High-level architecture plan]      │
│  3. GameDesignerAgent      [Gameplay & mechanics]              │
│  4. RobloxArchitectAgent   [Roblox-specific architecture]      │
│  5. UIGeneratorAgent       [UI/UX layouts] ─┐ parallel         │
│  6. AssetPlannerAgent      [Assets] ────────┤                 │
│  7. LuaGeneratorAgent      [Code specs] ────┘                 │
│                                                                 │
│ Each Agent:                                                     │
│  ├─ Inherits from AgentBase<TInput, TOutput>                  │
│  ├─ Implements execute()                                       │
│  ├─ Defines inputSchema & outputSchema                        │
│  ├─ Validates inputs/outputs                                  │
│  └─ Supports retry mechanism                                  │
│                                                                 │
│ AI Routing                                                      │
│  └─ AIRouter                                                    │
│      ├─ resolve(agentType) → provider + model                │
│      ├─ Provider Health Checks                                 │
│      └─ Fallback Strategy                                      │
│                                                                 │
│ Multi-Provider Support                                          │
│  ├─ Anthropic (Claude 3.5 Sonnet)                             │
│  ├─ OpenAI (GPT-4)                                            │
│  ├─ Google (Gemini 1.5 Pro)                                   │
│  └─ Ollama (Local models)                                     │
│                                                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────────┐
│              Data Types (server/src/types/)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ GameBlueprint (Core Domain Model)                              │
│  ├─ Metadata (id, version, status)                            │
│  ├─ Core Design (name, description, game_type)                │
│  ├─ Requirements (functional, non-functional)                 │
│  ├─ Gameplay (mechanics, progression, balance)                │
│  ├─ UI Layouts (HUD, menus, dialogs)                          │
│  ├─ Architecture (client, server, networking)                 │
│  ├─ Assets (models, textures, sounds, animations)             │
│  ├─ Code Spec (modules, patterns, standards)                  │
│  ├─ Validation (errors, warnings)                             │
│  └─ Metadata (generation_at, agents_involved)                 │
│                                                                 │
│ BlueprintVersion                                                │
│  ├─ Version tracking & snapshots                               │
│  └─ Change history                                             │
│                                                                 │
│ GenerationExecution                                             │
│  ├─ Execution tracking                                         │
│  ├─ Pipeline steps                                             │
│  └─ Retry information                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────────┐
│              Database (Prisma/SQLite)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Tables:                                                         │
│  ├─ game_blueprints         [current blueprint per project]    │
│  ├─ blueprint_versions       [history & snapshots]             │
│  ├─ generation_executions    [execution tracking]              │
│  ├─ projects                 [project metadata]                │
│  └─ users                    [user information]                │
│                                                                 │
│ Relationships:                                                  │
│  ├─ Project 1:1 GameBlueprint                                 │
│  ├─ GameBlueprint 1:N BlueprintVersions                       │
│  └─ GameBlueprint 1:N GenerationExecutions                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Blueprint Generation Flow

```
User Input (Natural Language)
        ↓
1. Create Blueprint (draft)
        ↓
2. Validate Blueprint
        ↓
3. POST /api/projects/:id/generate
        ↓
4. StartGeneration
   - Create execution record
   - Update status to generation_in_progress
   - Return executionId immediately
        ↓
5. ExecuteGenerationAsync (background)
   ├─ RequirementsAgent (parse prompt)
   ├─ PlannerAgent (high-level design)
   ├─ GameDesignerAgent (gameplay)
   ├─ RobloxArchitectAgent (Roblox specifics)
   ├─ [Parallel] UI + Assets + Lua
   └─ CollectOutputs → Assemble → Validate
        ↓
6. EventEmitter (stream via SSE)
   - step.started
   - step.completed / step.failed
   - pipeline.completed / pipeline.failed
        ↓
7. UpdateBlueprint (with generated content)
        ↓
8. CompleteGeneration (set status to ready_for_export)
        ↓
9. SaveVersion (checkpoint)
```

## Execution Modes

### Sequential

Executes stages one after another. Simple, predictable.

```
Requirements → Planner → Designer → Architect → [UI, Assets, Lua]
   (10s)       (20s)      (30s)      (25s)       (15s each)
Total: ~90s
```

### Parallel

Executes independent stages in parallel. Fast but resource-intensive.

```
                Requirements
                     ↓
                  Planner
                     ↓
                  Designer
                     ↓
                Architect
                ↙   ↓   ↘
              UI Assets  Lua
             (concurrent)
```

### Hybrid (Recommended)

Executes in batches of parallel stages as dependencies allow.

```
Requirements ─→ Planner ─→ Designer ─→ Architect ─→
                                          ↙ ↓ ↘
                                        UI Assets Lua
```

## Caching Strategy

```
Cache Hit Probability: ~80% for repeated queries

TTL: 5 minutes
Invalidation: Manual + automatic on expiry
Size: ~1MB per 10 active blueprints

Cache Operations:
  set(blueprint)          [O(1)]
  get(blueprintId)        [O(1)]
  getByProjectId()        [O(1) via projectId → blueprintId mapping]
  invalidate()            [O(1)]
```

## Error Handling & Retry Strategy

```
Agent Execution Failure
        ↓
RetryPolicy check
        ↓
    attempt < maxRetries?
    /                   \
  YES                    NO
   ↓                      ↓
Wait (backoff)         Fail Fast
  ↓                      ↓
Retry              Continue/Skip
  ↓
[onFailure strategy]
  ├─ fail_fast: Stop pipeline
  ├─ continue: Skip stage, continue
  └─ skip: Mark as skipped

Backoff: exponential with jitter
  Attempt 1: 1s ± 100ms
  Attempt 2: 2s ± 200ms
  Attempt 3: 4s ± 400ms
```

## Performance Characteristics

```
Memory Usage per Execution:
  - Base: 5MB
  - Per stage: ~1MB
  - Cache: ~100KB per active blueprint
  - Total for 10 concurrent: ~50MB

Throughput:
  - Concurrency: 2-4 parallel pipelines (configurable)
  - Sequential: 60-120 seconds per blueprint
  - Parallel: 30-60 seconds per blueprint
  - Hybrid: 45-90 seconds per blueprint

Latency:
  - API response: <100ms
  - First update event: ~5-10 seconds
  - Full generation: variable by game complexity
  - Cache hit: <50ms

Bandwidth:
  - Typical blueprint JSON: 500KB-2MB
  - SSE stream: ~1MB per generation
  - Per-step event: ~5-20KB
```

## Extensibility Points

### Adding New Agents

1. Create new agent class extending `AgentBase`
2. Implement `execute()` method
3. Define input/output schemas
4. Add to `GAME_GENERATION_PIPELINE` array
5. Update `AIPipelineIntegrator.GAME_GENERATION_PIPELINE`
6. Update `BlueprintAssembler` to extract outputs

### Adding New Blueprint Fields

1. Extend `GameBlueprint` interface
2. Update Prisma schema
3. Update validation rules in `BlueprintValidator`
4. Update assembly logic in `BlueprintAssembler`

### Adding New Providers

1. Implement `ModelProvider` interface
2. Add to `providers/` directory
3. Update `AIRouter` routing rules
4. Add health check logic

### Custom Retry Strategies

1. Extend `RetryPolicyExecutor`
2. Override `calculateBackoff()`
3. Implement custom retry conditions
4. Pass to `AIPipelineIntegrator` constructor

## Security Considerations

```
Input Validation:
  - Blueprint schema validation
  - Game type enum validation
  - String length limits

Authorization:
  - User ID validation
  - Project ownership verification
  - Rate limiting on /generate

Output Sanitization:
  - Blueprint export escaping
  - Event data validation
  - SSE XSS prevention

Database:
  - Use parameterized queries
  - Implement row-level security
  - Enable audit logging
```

## Monitoring & Observability

```
Metrics:
  - Generation success rate
  - Average generation time
  - Cache hit ratio
  - Retry rate per agent
  - Active client count (SSE)

Logs:
  - Pipeline execution timeline
  - Agent execution times
  - Error stack traces
  - Cache cleanup activity

Events:
  - Pipeline events (via SSE)
  - System events (via logs)
  - Error events (with context)
```

## Future Enhancements

```
Phase 2: Advanced Generation
  - Lua code generation (actual code)
  - GUI component generation
  - Terrain generation
  - Asset generation (3D models)
  - Animation generation
  - Audio generation

Phase 3: Roblox Studio Integration
  - Direct export plugin
  - Real-time sync with Studio
  - Asset upload automation
  - Plugin generation

Phase 4: Advanced Features
  - Multiplayer testing pipeline
  - Automatic bug detection
  - Performance optimization
  - A/B testing framework
  - User feedback integration
```

## Deployment Architecture

```
Production Setup:
  Frontend (React)
    ↓ (HTTPS)
  CDN / Load Balancer
    ↓
  [Express Server] (multiple instances)
    ├─ game-generation routes
    ├─ projects routes
    └─ health check
    ↓
  Database (PostgreSQL with replication)
  Cache (Redis)
  Message Queue (optional, for async jobs)

Scalability:
  - Stateless API servers (scale horizontally)
  - Cache layer (Redis cluster)
  - Database replication (primary + replicas)
  - Load balancing (round-robin or weighted)
  - Async job queue (for long-running tasks)
```
