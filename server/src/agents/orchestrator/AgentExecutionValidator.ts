/**
 * AgentExecutionValidator.ts — Validates orchestration execution integrity.
 */

import type { AgentExecutionPlan, AgentExecResult } from "./types";
import { SharedAgentContext } from "./SharedAgentContext";

export interface OrchestratorValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class AgentExecutionValidator {
  validatePlan(plan: AgentExecutionPlan): OrchestratorValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (plan.steps.length === 0) errors.push("Plan has no steps");
    const ids = new Set<string>();
    for (const step of plan.steps) {
      if (ids.has(step.stepId))
        errors.push(`Duplicate step ID: ${step.stepId}`);
      ids.add(step.stepId);
      for (const dep of step.dependencies) {
        if (!plan.steps.some((s) => s.agentId === dep)) {
          warnings.push(
            `Step ${step.agentId} depends on ${dep} which is not in plan`,
          );
        }
      }
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  validateResult(
    result: AgentExecResult,
    ctx: SharedAgentContext,
  ): OrchestratorValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (result.failedSteps > 0)
      warnings.push(`${result.failedSteps} step(s) failed`);
    if (Object.keys(result.outputs).length === 0 && result.success)
      errors.push("Success reported but no outputs");
    if (ctx.knowledgeCount === 0 && result.completedSteps > 0)
      warnings.push("No shared knowledge produced");
    return { valid: errors.length === 0, errors, warnings };
  }
}
