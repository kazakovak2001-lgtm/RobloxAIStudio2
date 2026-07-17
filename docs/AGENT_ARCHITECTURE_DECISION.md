# Agent Architecture Decision

**Date**: July 17, 2026  
**Status**: DECISION MADE

---

## Current State — Two Agent Systems

The project contains **two separate agent architectures** that are NOT connected:

### System A: `BaseAgent` + `AgentRegistry` (V1 — PRODUCTION)

| Aspect             | Detail                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base class         | `server/src/agents/core/BaseAgent.ts`                                                                                                                                                  |
| Registry           | `server/src/agents/core/AgentRegistry.ts`                                                                                                                                              |
| Location           | `server/src/agents/implementations/`                                                                                                                                                   |
| Agents registered  | 13 (requirements, planner, game_designer, roblox_architect, lua_generator, ui_generator, asset_planner, database_designer, documentation, tester, debugger, performance, orchestrator) |
| Used in production | ✅ YES — instantiated in `server/src/index.ts`                                                                                                                                         |
| LLM integration    | ✅ YES — `setLLM()` wired from `LLMProviderFactory`                                                                                                                                    |
| Used by routes     | `/api/evaluation`, `/api/plan`, `/api/generate`, `/api/compile`, `/api/concept`, `/api/v1`, `/api/v2`, `/api/distributed`                                                              |
| Lifecycle          | Created once at server boot, injected into services via constructor                                                                                                                    |
| Pattern            | Abstract class with `process()` method, built-in retry, LLM prompt templates                                                                                                           |

### System B: `BaseAgentV2` + `CapabilityRegistry` + `AgentOrchestrator` (V2 — EXPERIMENTAL)

| Aspect                    | Detail                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Base class                | `server/src/agents/orchestrator/BaseAgentV2.ts`                                         |
| Registry                  | `server/src/agents/orchestrator/CapabilityRegistry.ts`                                  |
| Orchestrator              | `server/src/agents/orchestrator/AgentOrchestrator.ts`                                   |
| Agents registered         | **0** — no BaseAgentV2 implementations exist in the codebase                            |
| Used in production server | ❌ NO — not imported in `server/src/index.ts`                                           |
| LLM integration           | ❌ NO — no LLM wiring mechanism                                                         |
| Used by routes            | ❌ NO — only used in `PlatformIntegrationManager` (test/integration layer)              |
| Lifecycle                 | Instantiated only in `PlatformIntegrationManager.start()` (test infrastructure)         |
| Pattern                   | Abstract class with `execute()` returning `AgentOutput`, capability-based task matching |

### System C: `AgentCoordinator` (Collaboration Layer — STANDALONE)

| Aspect                 | Detail                                                         |
| ---------------------- | -------------------------------------------------------------- |
| Location               | `server/src/agents/collaboration/`                             |
| Used by                | `/api/agents` route                                            |
| Base class             | None — uses its own `CollaborationTypes` with role-based tasks |
| Relationship to A or B | Independent — doesn't use BaseAgent or BaseAgentV2             |

---

## Analysis

### Production Path

```
server/src/index.ts
  └── new AgentRegistry(llmProvider)  ← Creates 13 BaseAgent instances
        └── Injected into: gameService, routes, executionCoordinator
              └── executeAgent(type, input) → agent.execute(input) → process(input)
```

### V2 Path (Unused in Production)

```
PlatformIntegrationManager.start()  ← Only used in integration tests
  └── new CapabilityRegistry()       ← Empty registry, 0 agents
  └── new AgentOrchestrator(registry) ← Orchestrator with no agents to orchestrate
```

### Key Finding

**BaseAgentV2 has ZERO implementations.** The `CapabilityRegistry` is always empty in practice. The `AgentOrchestrator` infrastructure (dependency planning, message bus, shared context, execution validator) exists but has no agents registered to use it.

The V2 system was designed as a future architecture but never populated with real agents. It's an aspirational framework without implementations.

---

## Decision: Use `BaseAgent` (V1) for New Controller Agents

### Reasons

1. **Production-proven**: All 13 existing agents use BaseAgent. It's battle-tested.
2. **LLM integration built-in**: `setLLM()` + `generateWithRetry()` + prompt templates are ready.
3. **Registry integration**: Adding to `AgentRegistry` gives immediate access to all routes that use it.
4. **Zero migration risk**: No adapter needed. Same pattern as existing DocumentationAgent, TesterAgent, etc.
5. **Immediate usability**: New agents are callable via `agentRegistry.executeAgent("architecture_controller", input)` from day one.

### Why NOT BaseAgentV2

1. **Zero implementations exist** — we'd be the first, with no reference pattern.
2. **Not connected to production** — would need to wire a parallel system into index.ts.
3. **No LLM support** — would need to build what BaseAgent already has.
4. **Aspirational, not production** — exists for future multi-agent orchestration scenarios that haven't materialized.

---

## Integration Pattern for New Agents

```typescript
// New agents follow the EXACT same pattern as DocumentationAgent:

import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class ArchitectureControllerAgent extends BaseAgent {
  public readonly name = "ArchitectureController";
  public readonly description = "...";
  public readonly inputSchema = { ... };
  public readonly outputSchema = { ... };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    // Use this.llm?.generate() for LLM reasoning (same as all other agents)
    // Use existing ImportBoundaryValidator for architecture data
    // Return structured output
  }
}
```

**Registration in AgentRegistry:**

```typescript
// In AgentRegistry constructor, add:
this.register("architecture_controller", new ArchitectureControllerAgent());
this.register("code_review_controller", new CodeReviewControllerAgent());
this.register("duplication_detector", new DuplicationDetectionAgent());
```

---

## Future Consideration

If the V2 orchestration system (dependency planning, shared context, message bus) is needed later for coordinating the controller agents with each other, it can be wired as an **adapter** that wraps BaseAgent instances into BaseAgentV2-compatible interfaces. But this is NOT needed for the current implementation.

---

## Migration Risks

| Risk                           | Level | Mitigation                                                                     |
| ------------------------------ | ----- | ------------------------------------------------------------------------------ |
| Adding agents to AgentRegistry | LOW   | Registry is append-only; no existing code affected                             |
| New agents getting LLM wired   | NONE  | Automatic via `setLLM()` call in AgentRegistry constructor                     |
| Agent type key conflicts       | NONE  | New keys (`architecture_controller`, etc.) don't conflict with existing 13     |
| Import boundaries              | LOW   | New agents in `server/src/agents/implementations/` — already an allowed domain |
