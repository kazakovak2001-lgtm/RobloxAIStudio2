import type { ExecutionPlan, PlanningMetrics } from "./PlanningTypes";
import { PlanningEngine } from "./PlanningEngine";

/**
 * PlanningRegistry
 *
 * Manages PlanningEngine instances and active plans.
 * Keyed by executionId — one plan per pipeline run.
 */
export class PlanningRegistry {
  private engine: PlanningEngine;
  private plans = new Map<string, ExecutionPlan>();

  constructor(engine?: PlanningEngine) {
    this.engine = engine ?? new PlanningEngine();
  }

  getEngine(): PlanningEngine {
    return this.engine;
  }

  /**
   * Build and register a new plan for an execution.
   */
  createPlan(executionId: string, goal?: string): ExecutionPlan {
    const plan = this.engine.buildPlan(executionId, goal);
    this.plans.set(executionId, plan);
    return plan;
  }

  getPlan(executionId: string): ExecutionPlan | null {
    return this.plans.get(executionId) ?? null;
  }

  hasPlan(executionId: string): boolean {
    return this.plans.has(executionId);
  }

  /**
   * Replace the current plan (used after replanning).
   */
  updatePlan(executionId: string, plan: ExecutionPlan): void {
    this.plans.set(executionId, plan);
  }

  removePlan(executionId: string): void {
    this.plans.delete(executionId);
  }

  getMetrics(executionId: string): PlanningMetrics | null {
    const plan = this.plans.get(executionId);
    if (!plan) return null;
    return this.engine.getMetrics(plan);
  }

  get size(): number {
    return this.plans.size;
  }
}

let _defaultRegistry: PlanningRegistry | null = null;

export function getDefaultPlanningRegistry(): PlanningRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new PlanningRegistry();
  }
  return _defaultRegistry;
}
