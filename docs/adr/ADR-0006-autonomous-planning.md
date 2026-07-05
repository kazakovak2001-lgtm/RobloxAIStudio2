# ADR-0006: Autonomous Planning Layer

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Engineering Team

---

## Context

The pipeline previously executed agents in a hardcoded static order (`PIPELINE_STAGES` array). This prevented:

- Parallel execution of independent stages (e.g. `ui_generator` + `lua_generator` + `asset_planner`)
- Automatic recovery from individual step failures (retry / skip / replan)
- Dynamic reordering based on context or availability
- Dependency validation at plan creation time

A planning layer was needed to make execution order data-driven and adaptive.

## Decision

Implement an Autonomous Planning Layer (`server/src/planning/`):

**Core components:**

- `PlanningTypes.ts` — `ExecutionPlan`, `PlanStep`, `PlanStepDefinition`, `PlanningMetrics`, `ReplanEvent`
- `PlanningRules.ts` — Declarative rule set: mandatory/optional/conditional/terminal steps, dependencies, parallel groups, retry policies
- `ExecutionPlan.ts` — Factory for creating plans from step definitions
- `PlanningEngine.ts` — Scheduling engine: `buildPlan()`, `next()`, `markCompleted/Failed/Skipped`, `replan()`, `getMetrics()`, `validateDependencies()`, `isBlocked()`
- `PlanningRegistry.ts` — Manages active plans keyed by executionId
- `PlanningMetrics.ts` — Computes critical path, success ratio, parallel opportunities, waiting time
- `PlanningContext.ts` — Read-only aggregate view for scheduling decisions

**Execution model change:**

```
Before: for (stage of PIPELINE_STAGES) { execute(stage) }
After:  while (step = engine.next(plan)) { execute(step); engine.markCompleted(); }
```

**Dependency graph (from DEFAULT_PLANNING_RULES):**

```
requirements → planner → game_designer → roblox_architect → lua_generator
                                        ↘ ui_generator      (parallel)
                                        ↘ asset_planner     (parallel)
                         lua_generator + ui_generator + asset_planner → final
```

**Replanning contract:**

1. Step fails → `engine.replan(plan, failedStep, reason)`
2. If step is retryable and attempts < maxRetries → reset to pending, retry
3. If step is optional → skip, continue
4. Otherwise → plan.status = "failed" → pipeline aborts

**Events:**

- `planning.created`, `planning.updated`, `planning.step.selected`
- `planning.replanned`, `planning.completed`, `planning.failed`

## Consequences

**Positive:**

- Execution order is data-driven (PlanningRules), not hardcoded
- Dependency validation catches misconfiguration at plan creation
- Retryable steps recover automatically without aborting the pipeline
- Critical path / metrics enable future optimisation decisions
- Parallel groups documented for when parallel execution is implemented

**Negative:**

- Current execution is still sequential (parallel mode not yet active)
- Adds ~5 event emissions per step (acceptable overhead)
- PlanningEngine is in-process; no distributed scheduling

**Neutral:**

- `PIPELINE_STAGES` static array remains for backward compatibility (used by aggregator)
- Plan state is ephemeral (lost on process restart) — same as memory layer

## Alternatives Considered

| Alternative                                   | Reason Not Chosen                                         |
| --------------------------------------------- | --------------------------------------------------------- |
| Keep static stage array                       | No retry, no dependency validation, no parallelism        |
| External workflow engine (Temporal, etc.)     | Massive dependency for v0.x; overkill for single-process  |
| LLM-driven planning (agent decides next step) | Non-deterministic; can't validate dependencies statically |
| Event-driven reactive pipeline                | Harder to reason about ordering; debugging is complex     |

## Future Extensions

- Enable actual parallel execution within `parallelGroup` steps
- Conditional step evaluation (skip stages based on context)
- Plan persistence for replay/debugging
- Cost-aware scheduling (route expensive steps to cheaper providers)
