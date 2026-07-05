import type {
  ExecutionPlan,
  PlanStep,
  PlanStepDefinition,
} from "./PlanningTypes";

/**
 * ExecutionPlan factory.
 * Creates a new plan from step definitions.
 */
export function createExecutionPlan(
  executionId: string,
  goal: string,
  stepDefs: PlanStepDefinition[],
): ExecutionPlan {
  const steps = new Map<string, PlanStep>();
  const dependencies: Record<string, string[]> = {};
  const parallelGroups: Record<string, string[]> = {};

  for (const def of stepDefs) {
    steps.set(def.id, {
      ...def,
      status: "pending",
      attempts: 0,
    });
    dependencies[def.id] = [...def.dependencies];
    if (def.parallelGroup) {
      const group = parallelGroups[def.parallelGroup] ?? [];
      group.push(def.id);
      parallelGroups[def.parallelGroup] = group;
    }
  }

  const allIds = stepDefs.map((s) => s.id);

  return {
    planId: `plan-${executionId}-${Date.now()}`,
    executionId,
    goal,
    priority: 1,
    status: "created",
    currentStep: null,
    remainingSteps: [...allIds],
    completedSteps: [],
    failedSteps: [],
    skippedSteps: [],
    parallelGroups,
    dependencies,
    steps,
    createdAt: new Date(),
    updatedAt: new Date(),
    replanCount: 0,
  };
}

/**
 * Clone a plan (for replanning).
 */
export function clonePlan(plan: ExecutionPlan): ExecutionPlan {
  const steps = new Map<string, PlanStep>();
  for (const [k, v] of plan.steps) {
    steps.set(k, { ...v });
  }
  return {
    ...plan,
    steps,
    remainingSteps: [...plan.remainingSteps],
    completedSteps: [...plan.completedSteps],
    failedSteps: [...plan.failedSteps],
    skippedSteps: [...plan.skippedSteps],
    parallelGroups: { ...plan.parallelGroups },
    dependencies: { ...plan.dependencies },
  };
}
