import type {
  ExecutionPlan,
  PlanStep,
  PlanStepDefinition,
  ReplanEvent,
  ReplanReason,
  PlanningMetrics,
} from "./PlanningTypes";
import { createExecutionPlan, clonePlan } from "./ExecutionPlan";
import { DEFAULT_PLANNING_RULES, ruleToPlanStep } from "./PlanningRules";
import { computePlanningMetrics } from "./PlanningMetrics";

/**
 * PlanningEngine
 *
 * Responsible for:
 *  - Building execution plans from rules
 *  - Validating dependency graphs
 *  - Selecting the next executable step
 *  - Detecting blocked stages
 *  - Replanning on failure while preserving completed work
 *  - Exposing planning metrics
 *
 * The engine does NOT execute agents — it only decides WHAT runs next.
 * AIPipelineIntegrator uses the engine's next() / markCompleted() / replan() API.
 */
export class PlanningEngine {
  private rules: PlanStepDefinition[];
  private replanHistory: ReplanEvent[] = [];

  constructor(rules?: PlanStepDefinition[]) {
    this.rules = rules ?? DEFAULT_PLANNING_RULES.map(ruleToPlanStep);
  }

  // ─── Plan creation ──────────────────────────────────────────────────────────

  /**
   * Build a new execution plan from the registered rules.
   */
  buildPlan(executionId: string, goal?: string): ExecutionPlan {
    const plan = createExecutionPlan(
      executionId,
      goal ?? "Generate complete Roblox game from blueprint",
      this.rules,
    );

    // Mark steps whose dependencies are already satisfied as "ready"
    this.refreshReadySteps(plan);

    console.log(
      `[PLANNING] Plan Created | Execution: ${executionId} | Steps: ${plan.steps.size}`,
    );

    return plan;
  }

  // ─── Step selection ─────────────────────────────────────────────────────────

  /**
   * Get the next step(s) that can be executed.
   * Returns an array because parallel groups may have multiple ready steps.
   * For the current sequential integrator, the caller takes the first.
   */
  getNextSteps(plan: ExecutionPlan): PlanStep[] {
    const ready: PlanStep[] = [];
    for (const step of plan.steps.values()) {
      if (step.status === "ready") {
        ready.push(step);
      }
    }
    // Sort by priority (lower = first)
    ready.sort((a, b) => a.priority - b.priority);
    return ready;
  }

  /**
   * Get the single next step for sequential execution.
   * Returns null if no step is ready (plan may be blocked or complete).
   */
  next(plan: ExecutionPlan): PlanStep | null {
    const ready = this.getNextSteps(plan);
    if (ready.length === 0) return null;

    const nextStep = ready[0];
    console.log(
      `[PLANNING] Next Step: ${nextStep.id} | Reason: Dependencies satisfied | Priority: ${nextStep.priority}`,
    );
    return nextStep;
  }

  // ─── Step lifecycle ─────────────────────────────────────────────────────────

  markRunning(plan: ExecutionPlan, stepId: string): void {
    const step = plan.steps.get(stepId);
    if (!step) return;
    step.status = "running";
    step.startedAt = new Date();
    step.attempts++;
    plan.currentStep = stepId;
    plan.status = "running";
    plan.updatedAt = new Date();
    // Remove from remaining
    plan.remainingSteps = plan.remainingSteps.filter((s) => s !== stepId);
  }

  markCompleted(
    plan: ExecutionPlan,
    stepId: string,
    durationMs: number,
    qualityScore?: number,
  ): void {
    const step = plan.steps.get(stepId);
    if (!step) return;
    step.status = "completed";
    step.completedAt = new Date();
    step.durationMs = durationMs;
    step.qualityScore = qualityScore;
    plan.completedSteps.push(stepId);
    plan.currentStep = null;
    plan.updatedAt = new Date();
    this.refreshReadySteps(plan);

    // Check if plan is complete
    if (plan.remainingSteps.length === 0 && !this.hasRunningSteps(plan)) {
      plan.status = "completed";
    }
  }

  markFailed(
    plan: ExecutionPlan,
    stepId: string,
    error: string,
    durationMs: number,
  ): void {
    const step = plan.steps.get(stepId);
    if (!step) return;
    step.status = "failed";
    step.error = error;
    step.durationMs = durationMs;
    step.completedAt = new Date();
    plan.failedSteps.push(stepId);
    plan.currentStep = null;
    plan.updatedAt = new Date();
  }

  markSkipped(plan: ExecutionPlan, stepId: string): void {
    const step = plan.steps.get(stepId);
    if (!step) return;
    step.status = "skipped";
    plan.skippedSteps.push(stepId);
    plan.remainingSteps = plan.remainingSteps.filter((s) => s !== stepId);
    plan.updatedAt = new Date();
    this.refreshReadySteps(plan);
  }

  // ─── Dependency validation ──────────────────────────────────────────────────

  /**
   * Validate that the dependency graph has no cycles and all references exist.
   */
  validateDependencies(plan: ExecutionPlan): string[] {
    const issues: string[] = [];
    const allIds = new Set(plan.steps.keys());

    for (const [stepId, deps] of Object.entries(plan.dependencies)) {
      for (const dep of deps) {
        if (!allIds.has(dep)) {
          issues.push(`Step "${stepId}" depends on non-existent step "${dep}"`);
        }
      }
    }

    // Cycle detection via DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      if (inStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      inStack.add(node);
      for (const dep of plan.dependencies[node] ?? []) {
        if (hasCycle(dep)) return true;
      }
      inStack.delete(node);
      return false;
    };

    for (const stepId of allIds) {
      if (hasCycle(stepId)) {
        issues.push(`Dependency cycle detected involving step "${stepId}"`);
        break;
      }
    }

    return issues;
  }

  /**
   * Check whether a step's dependencies are all satisfied (completed or skipped).
   */
  areDependenciesSatisfied(plan: ExecutionPlan, stepId: string): boolean {
    const deps = plan.dependencies[stepId] ?? [];
    return deps.every((dep) => {
      const depStep = plan.steps.get(dep);
      return depStep?.status === "completed" || depStep?.status === "skipped";
    });
  }

  // ─── Replanning ─────────────────────────────────────────────────────────────

  /**
   * Replan after a failure while preserving completed work.
   * Returns the new plan and a ReplanEvent describing what changed.
   */
  replan(
    plan: ExecutionPlan,
    failedStepId: string,
    reason: ReplanReason,
  ): { plan: ExecutionPlan; event: ReplanEvent } {
    const newPlan = clonePlan(plan);
    newPlan.replanCount++;
    newPlan.status = "replanned";
    newPlan.updatedAt = new Date();

    const failedStep = newPlan.steps.get(failedStepId);
    const preservedSteps = [...newPlan.completedSteps];

    // Check if the failed step can be retried
    if (
      failedStep &&
      failedStep.retryable &&
      failedStep.attempts < (failedStep.maxRetries ?? 1)
    ) {
      // Reset for retry
      failedStep.status = "pending";
      failedStep.error = undefined;
      newPlan.failedSteps = newPlan.failedSteps.filter(
        (s) => s !== failedStepId,
      );
      if (!newPlan.remainingSteps.includes(failedStepId)) {
        newPlan.remainingSteps.push(failedStepId);
      }
    } else if (failedStep && failedStep.kind === "optional") {
      // Skip optional steps
      failedStep.status = "skipped";
      newPlan.failedSteps = newPlan.failedSteps.filter(
        (s) => s !== failedStepId,
      );
      newPlan.skippedSteps.push(failedStepId);
    } else {
      // Terminal failure — mark plan as failed
      newPlan.status = "failed";
    }

    this.refreshReadySteps(newPlan);

    const event: ReplanEvent = {
      reason,
      failedStep: failedStepId,
      preservedSteps,
      newPlan: newPlan.remainingSteps,
      timestamp: new Date(),
    };

    this.replanHistory.push(event);

    console.log(
      `[PLANNING] Replanned | Reason: ${reason} | Failed: ${failedStepId} | ` +
        `Preserved: ${preservedSteps.length} | Remaining: ${newPlan.remainingSteps.length}`,
    );

    return { plan: newPlan, event };
  }

  // ─── Metrics ────────────────────────────────────────────────────────────────

  getMetrics(plan: ExecutionPlan): PlanningMetrics {
    return computePlanningMetrics(plan);
  }

  getReplanHistory(): ReadonlyArray<ReplanEvent> {
    return this.replanHistory;
  }

  // ─── Detection helpers ──────────────────────────────────────────────────────

  /**
   * Detect if the plan is blocked (no steps are ready, but remaining exist).
   */
  isBlocked(plan: ExecutionPlan): boolean {
    if (plan.status === "completed" || plan.status === "failed") return false;
    return (
      this.getNextSteps(plan).length === 0 && plan.remainingSteps.length > 0
    );
  }

  isPlanComplete(plan: ExecutionPlan): boolean {
    return (
      plan.remainingSteps.length === 0 &&
      !this.hasRunningSteps(plan) &&
      plan.failedSteps.length === 0
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private refreshReadySteps(plan: ExecutionPlan): void {
    for (const step of plan.steps.values()) {
      if (step.status === "pending") {
        if (this.areDependenciesSatisfied(plan, step.id)) {
          step.status = "ready";
        }
      }
    }
  }

  private hasRunningSteps(plan: ExecutionPlan): boolean {
    for (const step of plan.steps.values()) {
      if (step.status === "running") return true;
    }
    return false;
  }
}
