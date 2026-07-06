/**
 * RuntimeExecutionController.ts
 *
 * Orchestrates the full generátor lifecycle with explicit state machine:
 *   INIT → PLANNING → EXECUTING → VALIDATING → FINALIZING → COMPLETE | FAILED
 *
 * Wraps PlanExecutor with:
 *   - Checkpoint persistence per phase
 *   - Error boundary (no silent failures)
 *   - Telemetry emission
 *   - Resume-from-checkpoint capability
 */

import { PlannerEngine } from "../../planning/core/PlannerEngine";
import { PlanExecutor } from "../../planning/execution/PlanExecutor";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { ExecutionCheckpointSystem } from "../checkpoint/ExecutionCheckpointSystem";
import {
  RuntimeErrorBoundary,
  type ExecutionFailureReport,
} from "../errors/RuntimeErrorBoundary";
import { PipelineTelemetry } from "../telemetry/PipelineTelemetry";

export type ExecutionPhase =
  | "INIT"
  | "PLANNING"
  | "EXECUTING"
  | "VALIDATING"
  | "FINALIZING"
  | "COMPLETE"
  | "FAILED";

export interface RuntimeExecutionConfig {
  executionId: string;
  intent: string;
  constraints: string[];
  projectId?: string;
  resumeFromCheckpoint?: string;
  stopOnFailure?: boolean;
}

export interface RuntimeExecutionResult {
  executionId: string;
  phase: ExecutionPhase;
  success: boolean;
  outputs: Record<string, unknown>;
  checkpoints: string[];
  failureReport?: ExecutionFailureReport;
  telemetry: {
    totalDurationMs: number;
    phaseTimings: Record<string, number>;
    agentCallCount: number;
    memoryFootprintEstimate: number;
  };
}

export class RuntimeExecutionController {
  private agentRegistry: AgentRegistry;
  private checkpoints: ExecutionCheckpointSystem;
  private errorBoundary: RuntimeErrorBoundary;
  private telemetry: PipelineTelemetry;
  private currentPhase: ExecutionPhase = "INIT";

  constructor(agentRegistry: AgentRegistry) {
    this.agentRegistry = agentRegistry;
    this.checkpoints = new ExecutionCheckpointSystem();
    this.errorBoundary = new RuntimeErrorBoundary();
    this.telemetry = new PipelineTelemetry();
  }

  /**
   * Execute a full pipeline with lifecycle management.
   */
  async execute(
    config: RuntimeExecutionConfig,
  ): Promise<RuntimeExecutionResult> {
    const {
      executionId,
      intent,
      constraints,
      projectId,
      resumeFromCheckpoint,
      stopOnFailure = true,
    } = config;
    const startTime = Date.now();
    const phaseTimings: Record<string, number> = {};
    const checkpointIds: string[] = [];

    this.telemetry.startExecution(executionId, intent);
    this.transition("INIT");

    try {
      // ── RESUME from checkpoint if requested ────────────────────────────
      let resumedOutputs: Record<string, unknown> = {};
      if (resumeFromCheckpoint) {
        const cp = this.checkpoints.getCheckpoint(resumeFromCheckpoint);
        if (cp) {
          resumedOutputs = cp.state as Record<string, unknown>;
          this.transition(cp.phase as ExecutionPhase);
          this.telemetry.logEvent(executionId, "resume", {
            fromCheckpoint: resumeFromCheckpoint,
            phase: cp.phase,
          });
        }
      }

      // ── PLANNING ───────────────────────────────────────────────────────
      this.transition("PLANNING");
      const planStart = Date.now();

      const planner = new PlannerEngine();
      const plan = planner.createPlan({ intent, constraints, projectId });

      phaseTimings["PLANNING"] = Date.now() - planStart;
      const planCp = this.checkpoints.createCheckpoint(
        executionId,
        "PLANNING",
        {
          planId: plan.planId,
          estimatedSteps: plan.estimatedSteps,
        },
      );
      checkpointIds.push(planCp.id);
      this.telemetry.logPhase(
        executionId,
        "PLANNING",
        phaseTimings["PLANNING"],
      );

      // ── EXECUTING ──────────────────────────────────────────────────────
      this.transition("EXECUTING");
      const execStart = Date.now();

      const executor = new PlanExecutor();
      const planResult = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agentType, input) => {
          this.telemetry.incrementAgentCalls(executionId);
          return this.errorBoundary.wrapAgentCall(agentType, () =>
            this.agentRegistry.executeAgent(agentType, input),
          );
        },
        { projectId, stopOnFailure },
      );

      phaseTimings["EXECUTING"] = Date.now() - execStart;
      const execCp = this.checkpoints.createCheckpoint(
        executionId,
        "EXECUTING",
        {
          success: planResult.success,
          completedNodes: planResult.completedNodes,
          failedNodes: planResult.failedNodes,
          outputs: planResult.outputs,
        },
      );
      checkpointIds.push(execCp.id);
      this.telemetry.logPhase(
        executionId,
        "EXECUTING",
        phaseTimings["EXECUTING"],
      );

      if (!planResult.success && stopOnFailure) {
        return this.failResult(
          executionId,
          "EXECUTING",
          planResult.outputs,
          checkpointIds,
          phaseTimings,
          startTime,
          {
            failureType: "agent-failure",
            phase: "EXECUTING",
            message: `Plan execution failed: ${planResult.failedNodes} node(s) failed`,
            timestamp: Date.now(),
            recoverable: true,
            details: {
              completedNodes: planResult.completedNodes,
              failedNodes: planResult.failedNodes,
            },
          },
        );
      }

      // ── VALIDATING ─────────────────────────────────────────────────────
      this.transition("VALIDATING");
      const valStart = Date.now();

      const validationResult = this.validateOutputs(planResult.outputs);
      phaseTimings["VALIDATING"] = Date.now() - valStart;
      const valCp = this.checkpoints.createCheckpoint(
        executionId,
        "VALIDATING",
        { validationResult },
      );
      checkpointIds.push(valCp.id);
      this.telemetry.logPhase(
        executionId,
        "VALIDATING",
        phaseTimings["VALIDATING"],
      );

      if (!validationResult.valid) {
        return this.failResult(
          executionId,
          "VALIDATING",
          planResult.outputs,
          checkpointIds,
          phaseTimings,
          startTime,
          {
            failureType: "validation-failure",
            phase: "VALIDATING",
            message: `Output validation failed: ${validationResult.errors.join("; ")}`,
            timestamp: Date.now(),
            recoverable: false,
            details: validationResult,
          },
        );
      }

      // ── FINALIZING ─────────────────────────────────────────────────────
      this.transition("FINALIZING");
      const finStart = Date.now();

      const mergedOutputs = { ...resumedOutputs, ...planResult.outputs };
      phaseTimings["FINALIZING"] = Date.now() - finStart;
      const finCp = this.checkpoints.createCheckpoint(
        executionId,
        "FINALIZING",
        mergedOutputs,
      );
      checkpointIds.push(finCp.id);
      this.telemetry.logPhase(
        executionId,
        "FINALIZING",
        phaseTimings["FINALIZING"],
      );

      // ── COMPLETE ───────────────────────────────────────────────────────
      this.transition("COMPLETE");
      this.telemetry.completeExecution(
        executionId,
        true,
        Date.now() - startTime,
      );

      return {
        executionId,
        phase: "COMPLETE",
        success: true,
        outputs: mergedOutputs,
        checkpoints: checkpointIds,
        telemetry: {
          totalDurationMs: Date.now() - startTime,
          phaseTimings,
          agentCallCount: this.telemetry.getAgentCallCount(executionId),
          memoryFootprintEstimate: this.estimateMemoryFootprint(mergedOutputs),
        },
      };
    } catch (err) {
      const failure = this.errorBoundary.captureError(err, this.currentPhase);
      this.telemetry.completeExecution(
        executionId,
        false,
        Date.now() - startTime,
      );

      return this.failResult(
        executionId,
        this.currentPhase,
        {},
        checkpointIds,
        phaseTimings,
        startTime,
        failure,
      );
    }
  }

  /**
   * Get current execution phase.
   */
  getPhase(): ExecutionPhase {
    return this.currentPhase;
  }

  getCheckpointSystem(): ExecutionCheckpointSystem {
    return this.checkpoints;
  }

  getTelemetry(): PipelineTelemetry {
    return this.telemetry;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private transition(phase: ExecutionPhase): void {
    this.currentPhase = phase;
  }

  private validateOutputs(outputs: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!outputs || typeof outputs !== "object") {
      errors.push("Outputs are null or not an object");
      return { valid: false, errors };
    }

    // Verify JSON-serializable
    try {
      JSON.stringify(outputs);
    } catch {
      errors.push("Outputs are not JSON-serializable");
    }

    return { valid: errors.length === 0, errors };
  }

  private failResult(
    executionId: string,
    _phase: ExecutionPhase,
    outputs: Record<string, unknown>,
    checkpoints: string[],
    phaseTimings: Record<string, number>,
    startTime: number,
    failure: ExecutionFailureReport,
  ): RuntimeExecutionResult {
    this.transition("FAILED");
    return {
      executionId,
      phase: "FAILED",
      success: false,
      outputs,
      checkpoints,
      failureReport: failure,
      telemetry: {
        totalDurationMs: Date.now() - startTime,
        phaseTimings,
        agentCallCount: this.telemetry.getAgentCallCount(executionId),
        memoryFootprintEstimate: this.estimateMemoryFootprint(outputs),
      },
    };
  }

  private estimateMemoryFootprint(obj: unknown): number {
    try {
      return JSON.stringify(obj).length * 2; // rough byte estimate
    } catch {
      return 0;
    }
  }
}
