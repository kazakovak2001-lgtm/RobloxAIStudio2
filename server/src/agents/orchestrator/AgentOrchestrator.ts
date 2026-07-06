/**
 * AgentOrchestrator.ts — Top-level multi-agent coordination (v2.7).
 * Deterministic execution through dependency-resolved plan.
 */

import { CapabilityRegistry } from "./CapabilityRegistry";
import { AgentDependencyPlanner } from "./AgentDependencyPlanner";
import { AgentMessageBus } from "./AgentMessageBus";
import { SharedAgentContext } from "./SharedAgentContext";
import {
  AgentExecutionValidator,
  type OrchestratorValidationReport,
} from "./AgentExecutionValidator";
import type {
  AgentExecContext,
  AgentExecResult,
  AgentExecutionPlan,
} from "./types";
import { createPlanId } from "./types";

export class AgentOrchestrator {
  private registry: CapabilityRegistry;
  private planner: AgentDependencyPlanner;
  private messageBus: AgentMessageBus;
  private validator: AgentExecutionValidator;

  constructor(registry?: CapabilityRegistry) {
    this.registry = registry ?? new CapabilityRegistry();
    this.planner = new AgentDependencyPlanner();
    this.messageBus = new AgentMessageBus();
    this.validator = new AgentExecutionValidator();
  }

  /**
   * Orchestrate agents for a given task.
   */
  async orchestrate(
    task: string,
    projectId: string,
    intent: string,
  ): Promise<AgentExecResult> {
    const totalStart = Date.now();
    const sharedCtx = new SharedAgentContext();
    const errors: string[] = [];
    const outputs: Record<string, unknown> = {};

    // Plan
    const capabilities = this.registry.getCapabilities();
    const planResult = this.planner.createPlan(capabilities, task);

    if (!planResult.valid || !planResult.plan) {
      return {
        planId: createPlanId(),
        success: false,
        completedSteps: 0,
        failedSteps: 0,
        totalDurationMs: Date.now() - totalStart,
        outputs: {},
        errors: planResult.errors,
      };
    }

    const plan = planResult.plan;
    const ctx: AgentExecContext = {
      planId: plan.planId,
      projectId,
      intent,
      sharedOutputs: {},
      completedSteps: [],
      startedAt: Date.now(),
    };

    // Execute steps in order
    let completed = 0;
    let failed = 0;

    for (const step of plan.steps) {
      const agent = this.registry.get(step.agentId);
      if (!agent) {
        step.status = "skipped";
        continue;
      }

      step.status = "running";
      this.messageBus.send("orchestrator", step.agentId, "request", {
        task: step.task,
        context: sharedCtx.toRecord(),
      });

      const stepStart = Date.now();
      try {
        const result = await agent.execute({
          task: step.task,
          context: { ...sharedCtx.toRecord(), projectId, intent },
        });
        step.durationMs = Date.now() - stepStart;

        if (result.success) {
          step.status = "completed";
          step.output = result.outputs;
          completed++;
          // Share outputs
          for (const [k, v] of Object.entries(result.outputs)) {
            sharedCtx.setKnowledge(k, v, step.agentId);
            outputs[`${step.agentId}.${k}`] = v;
          }
          sharedCtx.storeArtifact(step.agentId, result.outputs);
          ctx.completedSteps.push(step.agentId);
          this.messageBus.send(step.agentId, "orchestrator", "response", {
            success: true,
          });
        } else {
          step.status = "failed";
          step.error = result.error;
          failed++;
          errors.push(`${step.agentId}: ${result.error}`);
          this.messageBus.send(step.agentId, "orchestrator", "response", {
            success: false,
            error: result.error,
          });
        }
      } catch (err) {
        step.status = "failed";
        step.durationMs = Date.now() - stepStart;
        step.error = err instanceof Error ? err.message : String(err);
        failed++;
        errors.push(`${step.agentId}: ${step.error}`);
      }
    }

    ctx.sharedOutputs = outputs;

    return {
      planId: plan.planId,
      success: failed === 0,
      completedSteps: completed,
      failedSteps: failed,
      totalDurationMs: Date.now() - totalStart,
      outputs,
      errors,
    };
  }

  getRegistry(): CapabilityRegistry {
    return this.registry;
  }
  getMessageBus(): AgentMessageBus {
    return this.messageBus;
  }
  getValidator(): AgentExecutionValidator {
    return this.validator;
  }

  validatePlan(plan: AgentExecutionPlan): OrchestratorValidationReport {
    return this.validator.validatePlan(plan);
  }
}
