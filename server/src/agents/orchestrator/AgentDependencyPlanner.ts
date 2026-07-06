/**
 * AgentDependencyPlanner.ts — Resolves agent execution order via topological sort.
 */

import type {
  AgentCapability,
  AgentExecutionPlan,
  AgentExecutionStep,
} from "./types";
import { createPlanId, createStepId } from "./types";

export interface PlanningResult {
  valid: boolean;
  plan?: AgentExecutionPlan;
  cycles: string[];
  errors: string[];
}

export class AgentDependencyPlanner {
  createPlan(capabilities: AgentCapability[], task: string): PlanningResult {
    const errors: string[] = [];
    // Filter relevant agents
    const relevant = capabilities.filter(
      (c) => c.supportedTasks.includes(task) || c.supportedTasks.includes("*"),
    );
    if (relevant.length === 0) {
      errors.push(`No agent supports task: ${task}`);
      return { valid: false, cycles: [], errors };
    }

    // Topological sort
    const inDeg = new Map<string, number>();
    for (const cap of relevant) inDeg.set(cap.agentId, 0);
    for (const cap of relevant) {
      for (const dep of cap.dependencies) {
        if (relevant.some((c) => c.agentId === dep)) {
          inDeg.set(cap.agentId, (inDeg.get(cap.agentId) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDeg) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const cap of relevant) {
        if (cap.dependencies.includes(current)) {
          inDeg.set(cap.agentId, (inDeg.get(cap.agentId) ?? 0) - 1);
          if (inDeg.get(cap.agentId) === 0) queue.push(cap.agentId);
        }
      }
    }

    const cycles: string[] = [];
    if (sorted.length < relevant.length) {
      const remaining = relevant
        .filter((c) => !sorted.includes(c.agentId))
        .map((c) => c.agentId);
      cycles.push(...remaining);
      errors.push(`Circular dependency: ${remaining.join(" → ")}`);
      return { valid: false, cycles, errors };
    }

    // Build steps
    const steps: AgentExecutionStep[] = sorted.map((agentId) => {
      const cap = relevant.find((c) => c.agentId === agentId)!;
      return {
        stepId: createStepId(),
        agentId,
        task,
        dependencies: cap.dependencies.filter((d) => sorted.includes(d)),
        status: "pending",
      };
    });

    return {
      valid: true,
      plan: {
        planId: createPlanId(),
        steps,
        totalSteps: steps.length,
        createdAt: Date.now(),
      },
      cycles: [],
      errors: [],
    };
  }
}
