import type { ExecutionPlan, PlanningMetrics, PlanStep } from "./PlanningTypes";

/**
 * Compute planning metrics from a completed (or failed) execution plan.
 */
export function computePlanningMetrics(plan: ExecutionPlan): PlanningMetrics {
  const allSteps = Array.from(plan.steps.values());
  const completed = allSteps.filter((s) => s.status === "completed");
  const failed = allSteps.filter((s) => s.status === "failed");
  const skipped = allSteps.filter((s) => s.status === "skipped");

  const stepDurations: Record<string, number> = {};
  let totalDurationMs = 0;
  for (const step of allSteps) {
    if (step.durationMs !== undefined) {
      stepDurations[step.id] = step.durationMs;
      totalDurationMs += step.durationMs;
    }
  }

  // Critical path: longest chain through dependency graph
  const criticalPathMs = computeCriticalPath(plan);

  // Parallel opportunities: count steps that share a parallelGroup
  const parallelOpportunities = Object.values(plan.parallelGroups).filter(
    (g) => g.length > 1,
  ).length;

  const totalSteps = allSteps.length;
  const successRatio = totalSteps === 0 ? 0 : completed.length / totalSteps;

  // Waiting time: total plan time minus sum of actual step execution
  const wallClock = plan.updatedAt.getTime() - plan.createdAt.getTime();
  const waitingTimeMs = Math.max(0, wallClock - totalDurationMs);

  return {
    planId: plan.planId,
    totalSteps,
    completedSteps: completed.length,
    failedSteps: failed.length,
    skippedSteps: skipped.length,
    totalDurationMs,
    stepDurations,
    criticalPathMs,
    parallelOpportunities,
    replanCount: plan.replanCount,
    successRatio,
    waitingTimeMs,
  };
}

/**
 * Compute critical path through the dependency DAG using step durations.
 * Returns the total ms of the longest path from start to terminal node.
 */
function computeCriticalPath(plan: ExecutionPlan): number {
  const memo = new Map<string, number>();

  function longestPath(stepId: string): number {
    if (memo.has(stepId)) return memo.get(stepId)!;
    const step: PlanStep | undefined = plan.steps.get(stepId);
    const dur = step?.durationMs ?? 0;
    const deps = plan.dependencies[stepId] ?? [];
    if (deps.length === 0) {
      memo.set(stepId, dur);
      return dur;
    }
    let maxDep = 0;
    for (const dep of deps) {
      maxDep = Math.max(maxDep, longestPath(dep));
    }
    const total = maxDep + dur;
    memo.set(stepId, total);
    return total;
  }

  let critical = 0;
  for (const stepId of plan.steps.keys()) {
    critical = Math.max(critical, longestPath(stepId));
  }
  return critical;
}
