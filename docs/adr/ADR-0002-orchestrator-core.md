# ADR-0002: Orchestrator Core Architecture

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Engineering Team

---

## Context

The Roblox AI Studio DevKit requires a mechanism to coordinate multiple AI agents in a defined sequence to generate a complete game blueprint. Each agent is responsible for a distinct generation phase (requirements, design, architecture, code, etc.). The system needed a central coordinator that could manage the execution order, pass outputs between agents, and handle failures without requiring agents to know about each other.

## Decision

Implement `AIPipelineIntegrator` as a sequential orchestrator with a static `PIPELINE_STAGES` definition. Each stage specifies an `agent` name (registry key) and a `stepId` (output bucket key). The integrator:

- Iterates stages in order
- Builds agent input from `blueprint + seed + flat accumulated prior outputs`
- Stores each stage output under `pipelineOutputs[stepId]` AND spreads it flat
- Short-circuits on any failure (`_failed` marker or evaluation rejection)
- Emits `pipeline.started`, `step.started`, `step.completed`, `step.failed`, `pipeline.completed`, `pipeline.failed` events

The `AgentRegistry` holds a single instance of each agent, wired with an `LLMProvider` via `setLLM()`. The `OrchestratorAgent` is registered as the final stage with a self-reference to the registry for Mode B coordination.

## Consequences

**Positive:**

- Strictly sequential execution is simple to reason about and debug
- Flat output spreading prevents double-nesting in downstream agent inputs
- Static stage list is inspectable at runtime (`PIPELINE_STAGES`)
- Single short-circuit point for failure handling

**Negative:**

- No parallelism — stages that could run concurrently (e.g. ui_generator + asset_planner) execute sequentially
- Adding a new pipeline stage requires changing `PIPELINE_STAGES`

**Neutral:**

- `AIPipelineIntegrator` is a concrete class, not an interface — sufficient for v0.x scope

## Alternatives Considered

| Alternative                     | Reason Not Chosen                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| DAG-based parallel pipeline     | Significantly higher complexity; sequential is sufficient for v0.x                 |
| Agent-to-agent direct messaging | Couples agents, makes debugging harder; memory layer now handles cross-agent state |
| Dynamic stage discovery         | Premature — stages are stable for v0.x                                             |

## Notes

- See `server/src/execution/aiPipelineIntegrator.ts`
- See `server/src/agents/core/AgentRegistry.ts`
- Supersedes the original broken `runAgent()` dispatcher from pre-v0.2
