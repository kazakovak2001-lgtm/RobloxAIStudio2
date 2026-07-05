import type { PlanStepDefinition, StepKind } from "./PlanningTypes";

/**
 * PlanningRules.ts
 *
 * Declarative rule definitions for the default game generation pipeline.
 * These rules define step ordering, dependencies, parallelism, and retry policy.
 * PlanningEngine consumes these to build and validate ExecutionPlans.
 */

export interface PlanningRule {
  stepId: string;
  agent: string;
  kind: StepKind;
  dependencies: string[];
  parallelGroup?: string;
  retryable: boolean;
  maxRetries?: number;
  priority: number;
  condition?: string;
}

/**
 * Default pipeline rules.
 * Dependency graph:
 *   requirements → planner → game_designer → roblox_architect
 *                                           → ui_generator      (parallel group "gen")
 *                           roblox_architect → lua_generator     (parallel group "gen")
 *   ui_generator + lua_generator + asset_planner → final (orchestrator)
 *   game_designer → asset_planner
 */
export const DEFAULT_PLANNING_RULES: PlanningRule[] = [
  {
    stepId: "requirements",
    agent: "requirements",
    kind: "mandatory",
    dependencies: [],
    retryable: true,
    maxRetries: 2,
    priority: 10,
  },
  {
    stepId: "planner",
    agent: "planner",
    kind: "mandatory",
    dependencies: ["requirements"],
    retryable: true,
    maxRetries: 2,
    priority: 20,
  },
  {
    stepId: "game_designer",
    agent: "game_designer",
    kind: "mandatory",
    dependencies: ["planner"],
    retryable: true,
    maxRetries: 2,
    priority: 30,
  },
  {
    stepId: "roblox_architect",
    agent: "roblox_architect",
    kind: "mandatory",
    dependencies: ["game_designer"],
    retryable: true,
    maxRetries: 2,
    priority: 40,
  },
  {
    stepId: "lua_generator",
    agent: "lua_generator",
    kind: "mandatory",
    dependencies: ["roblox_architect"],
    parallelGroup: "gen",
    retryable: true,
    maxRetries: 2,
    priority: 50,
  },
  {
    stepId: "ui_generator",
    agent: "ui_generator",
    kind: "mandatory",
    dependencies: ["game_designer"],
    parallelGroup: "gen",
    retryable: true,
    maxRetries: 1,
    priority: 50,
  },
  {
    stepId: "asset_planner",
    agent: "asset_planner",
    kind: "mandatory",
    dependencies: ["game_designer"],
    parallelGroup: "gen",
    retryable: true,
    maxRetries: 1,
    priority: 50,
  },
  {
    stepId: "final",
    agent: "orchestrator",
    kind: "terminal",
    dependencies: ["lua_generator", "ui_generator", "asset_planner"],
    retryable: false,
    priority: 100,
  },
];

/**
 * Convert a PlanningRule to a PlanStepDefinition (used by PlanningEngine).
 */
export function ruleToPlanStep(rule: PlanningRule): PlanStepDefinition {
  return {
    id: rule.stepId,
    agent: rule.agent,
    kind: rule.kind,
    dependencies: [...rule.dependencies],
    parallelGroup: rule.parallelGroup,
    retryable: rule.retryable,
    maxRetries: rule.maxRetries ?? 1,
    priority: rule.priority,
    condition: rule.condition,
  };
}
