/**
 * PlanExecutor.ts
 *
 * Executes a TaskGraph by resolving dependencies and coordinating agents.
 * Integrates with Memory v0.6 (context injection) and Evaluation v0.5 (scoring).
 * Supports sequential + parallel execution where DAG permits.
 */

import { TaskGraph, type TaskNode } from "../model/TaskGraph";
import { AgentMemoryBridge } from "../../memory/agents/AgentMemoryBridge";
import { AgentEvaluator } from "../../evaluation/agents/AgentEvaluator";
import { ExecutionTracer } from "../../core/observability/ExecutionTracer";
import { AgentDecisionEngine } from "../../core/agents/AgentDecisionEngine";
import type { PipelineEventPublisher } from "../../types/pipeline-events";

export interface ExecutionOptions {
  projectId?: string;
  parallel?: boolean; // allow parallel execution of independent nodes
  stopOnFailure?: boolean;
  maxRetries?: number;
}

export interface PlanExecutionResult {
  planId: string;
  graph: TaskGraph;
  success: boolean;
  completedNodes: number;
  failedNodes: number;
  totalDurationMs: number;
  outputs: Record<string, unknown>;
}

export class PlanExecutor {
  private memoryBridge: AgentMemoryBridge;
  private evaluator: AgentEvaluator;
  private tracer: ExecutionTracer;
  private decisionEngine: AgentDecisionEngine;
  private events?: PipelineEventPublisher;

  constructor(
    memoryBridge?: AgentMemoryBridge,
    evaluator?: AgentEvaluator,
    tracer?: ExecutionTracer,
    decisionEngine?: AgentDecisionEngine,
    events?: PipelineEventPublisher,
  ) {
    this.memoryBridge = memoryBridge ?? new AgentMemoryBridge();
    this.evaluator = evaluator ?? new AgentEvaluator();
    this.tracer = tracer ?? ExecutionTracer.instance();
    this.decisionEngine = decisionEngine ?? new AgentDecisionEngine();
    this.events = events;
  }

  /**
   * Execute a full plan by iterating through the DAG.
   */
  async executePlan(
    planId: string,
    graph: TaskGraph,
    agentExecutor: (
      agentType: string,
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>,
    options: ExecutionOptions = {},
  ): Promise<PlanExecutionResult> {
    const totalStart = Date.now();
    const { projectId, stopOnFailure = true, maxRetries = 1 } = options;

    console.log(
      `[PLAN-EXEC] Starting | Plan: ${planId} | Tasks: ${graph.size} | Goal: ${graph.goal.slice(0, 60)}`,
    );

    // Emit trace: plan started
    this.tracer.startExecution(planId, planId, graph.goal, graph.size);
    await this.emitPipelineStarted(planId, projectId);

    // Reset adaptive agent switch counts for this execution
    this.decisionEngine.resetSwitchCounts();

    // Validate DAG before execution
    const { valid, cycles } = graph.validateDAG();
    if (!valid) {
      console.error(
        `[PLAN-EXEC] Invalid DAG — cycles detected: ${cycles.join(", ")}`,
      );
      const failResult = this.buildResult(
        planId,
        graph,
        Date.now() - totalStart,
      );
      this.tracer.completeExecution(planId, failResult.outputs, false);
      return failResult;
    }

    // Execute until no more ready nodes
    while (!graph.isComplete()) {
      const readyNodes = graph.getReadyNodes();
      if (readyNodes.length === 0) {
        // Deadlock or all remaining nodes have unsatisfied deps from failed nodes
        break;
      }

      // Execute ready nodes (sequentially for now; parallel support is structural)
      for (const node of readyNodes) {
        await this.executeNode(
          planId,
          node,
          graph,
          agentExecutor,
          projectId,
          maxRetries,
        );

        if (stopOnFailure && node.status === "failed") {
          console.log(
            `[PLAN-EXEC] Stopped on failure | Node: ${node.id} | agent=${node.agent}`,
          );
          const failResult = this.buildResult(
            planId,
            graph,
            Date.now() - totalStart,
          );
          this.tracer.completeExecution(planId, failResult.outputs, false);
          await this.emitPipelineFailed(
            planId,
            "Pipeline stopped on node failure",
            projectId,
            {
              stepId: node.id,
              agentId: node.agent,
              stage: node.type,
              failedReason: node.error,
            },
          );
          return failResult;
        }
      }
    }

    const result = this.buildResult(planId, graph, Date.now() - totalStart);
    console.log(
      `[PLAN-EXEC] Complete | Plan: ${planId} | Success: ${result.success} | Duration: ${result.totalDurationMs}ms`,
    );

    // Emit trace: plan completed
    this.tracer.completeExecution(planId, result.outputs, result.success);
    const metadata = {
      success: result.success,
      totalDurationMs: result.totalDurationMs,
      completedSteps: result.completedNodes,
      failedSteps: result.failedNodes,
    };

    if (result.success) {
      await this.emitPipelineCompleted(
        planId,
        result.outputs,
        projectId,
        metadata,
      );
    } else {
      console.error(
        `[PLAN-EXEC] Pipeline failed | pipelineId=${planId} | projectId=${projectId ?? "unknown"} | failedSteps=${result.failedNodes} | completedSteps=${result.completedNodes}`,
      );
      await this.emitPipelineFailed(
        planId,
        "Pipeline completed with failures",
        projectId,
        metadata,
      );
    }

    return result;
  }

  private async executeNode(
    pipelineId: string,
    node: TaskNode,
    graph: TaskGraph,
    agentExecutor: (
      agentType: string,
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>,
    projectId?: string,
    maxRetries = 1,
  ): Promise<void> {
    graph.markRunning(node.id);
    const start = Date.now();

    // Trace: node started
    this.tracer.traceNodeStart(node.id, node.id, node.agent, node.input);

    // Build input: node input + accumulated outputs from completed dependencies
    const accumulatedOutputs = graph.getAccumulatedOutputs();
    let input: Record<string, unknown> = {
      ...node.input,
      ...accumulatedOutputs,
    };

    // Memory injection: retrieve relevant memory for this agent
    try {
      const memory = await this.memoryBridge.retrieveForAgent(
        node.agent,
        input,
        projectId,
      );
      if (Object.keys(memory.merged).length > 0) {
        input = { ...input, _memory: memory.merged };
        // Trace: memory injected
        this.tracer.traceMemoryInjection(
          node.id,
          node.id,
          node.agent,
          memory.merged,
        );
      }
    } catch {
      /* non-blocking */
    }

    // Execute with retry + adaptive agent selection
    let attempts = 0;
    let activeAgent = node.agent;

    // Adaptive agent selection (non-breaking: falls back to assigned agent)
    try {
      const allAgents = graph.getAllNodes().map((n) => n.agent);
      const uniqueAgents = [...new Set(allAgents)];
      const selection = this.decisionEngine.selectAgent({
        taskType: node.type,
        assignedAgent: node.agent,
        availableAgents: uniqueAgents,
        contextKeys: Object.keys(input).slice(0, 10),
      });
      activeAgent = selection.selectedAgent;
    } catch {
      /* Decision engine errors are non-blocking — use assigned agent */
    }

    while (attempts < maxRetries) {
      attempts++;
      try {
        await this.emitStepStarted(pipelineId, node.id, activeAgent, projectId);
        const output = await agentExecutor(activeAgent, input);
        const durationMs = Date.now() - start;

        // Evaluate output quality
        const { evaluation } = await this.evaluator.evaluate(
          activeAgent,
          output,
          {
            expectedKeys:
              Object.keys(node.input).length > 0 ? undefined : undefined,
            taskDescription: node.type,
          },
        );

        // Trace: evaluation scored
        this.tracer.traceEvaluation(
          node.id,
          node.id,
          activeAgent,
          evaluation.score.quality,
          evaluation.passed,
        );

        // Record execution result for future adaptive decisions
        this.decisionEngine.recordExecution({
          agent: activeAgent,
          taskType: node.type,
          executionId: node.id,
          nodeId: node.id,
          success: true,
          quality: evaluation.score.quality,
          durationMs,
          contextKeys: Object.keys(input).slice(0, 10),
          timestamp: Date.now(),
        });

        // Store in memory for future use
        await this.memoryBridge.storeFromAgent(
          activeAgent,
          input,
          output,
          projectId,
        );

        graph.markDone(node.id, output, durationMs, {
          quality: evaluation.score.quality,
          passed: evaluation.passed,
        });

        await this.emitStepCompleted(
          pipelineId,
          node.id,
          activeAgent,
          output,
          projectId,
        );

        // Trace: node completed
        this.tracer.traceNodeComplete(
          node.id,
          node.id,
          activeAgent,
          output,
          durationMs,
          evaluation.score.quality,
          evaluation.passed,
        );

        return;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);

        // Record failure for learning
        this.decisionEngine.recordExecution({
          agent: activeAgent,
          taskType: node.type,
          executionId: node.id,
          nodeId: node.id,
          success: false,
          quality: 0,
          durationMs: Date.now() - start,
          contextKeys: Object.keys(input).slice(0, 10),
          timestamp: Date.now(),
        });

        // Attempt adaptive fallback before exhausting retries
        if (attempts < maxRetries) {
          const allAgents = graph.getAllNodes().map((n) => n.agent);
          const uniqueAgents = [...new Set(allAgents)];
          const fallback = this.decisionEngine.requestFallback({
            nodeId: node.id,
            failedAgent: activeAgent,
            taskType: node.type,
            availableAgents: uniqueAgents,
            contextKeys: Object.keys(input).slice(0, 10),
          });

          if (fallback) {
            console.log(
              `[PLAN-EXEC] Agent fallback | Node: ${node.id} | ${fallback.originalAgent} → ${fallback.fallbackAgent}`,
            );
            activeAgent = fallback.fallbackAgent;
          }
        }

        if (attempts >= maxRetries) {
          const durationMs = Date.now() - start;
          graph.markFailed(node.id, error, durationMs);
          console.error(
            `[PLAN-EXEC] Step failed | pipelineId=${pipelineId} | projectId=${projectId ?? "unknown"} | stepId=${node.id} | agent=${activeAgent} | error=${error}`,
          );
          if (err instanceof Error && err.stack) {
            console.error(err.stack);
          }

          await this.emitStepFailed(
            pipelineId,
            node.id,
            activeAgent,
            error,
            projectId,
          );

          // Trace: node failed
          this.tracer.traceNodeFailed(
            node.id,
            node.id,
            activeAgent,
            error,
            durationMs,
          );
        }
      }
    }
  }

  private buildResult(
    planId: string,
    graph: TaskGraph,
    totalDurationMs: number,
  ): PlanExecutionResult {
    const stats = graph.getStats();
    return {
      planId,
      graph,
      success: !graph.hasFailed() && stats.done === stats.total,
      completedNodes: stats.done,
      failedNodes: stats.failed,
      totalDurationMs,
      outputs: graph.getAccumulatedOutputs(),
    };
  }

  private async emitPipelineStarted(
    pipelineId: string,
    projectId?: string,
  ): Promise<void> {
    if (!this.events) return;
    await this.events.emitPipelineStarted(pipelineId, projectId);
  }

  private async emitStepStarted(
    pipelineId: string,
    stepId: string,
    agentId: string,
    projectId?: string,
  ): Promise<void> {
    if (!this.events) return;
    await this.events.emitStepStarted(pipelineId, stepId, agentId, projectId);
  }

  private async emitStepCompleted(
    pipelineId: string,
    stepId: string,
    agentId: string,
    output?: Record<string, unknown>,
    projectId?: string,
  ): Promise<void> {
    if (!this.events) return;
    await this.events.emitStepCompleted(
      pipelineId,
      stepId,
      agentId,
      output,
      projectId,
    );
  }

  private async emitStepFailed(
    pipelineId: string,
    stepId: string,
    agentId: string,
    error: string,
    projectId?: string,
  ): Promise<void> {
    if (!this.events) return;
    await this.events.emitStepFailed(
      pipelineId,
      stepId,
      agentId,
      error,
      projectId,
    );
  }

  private async emitPipelineCompleted(
    pipelineId: string,
    outputs: Record<string, unknown>,
    projectId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.events) return;
    await this.events.emitPipelineCompleted(
      pipelineId,
      outputs,
      projectId,
      metadata,
    );
  }

  private async emitPipelineFailed(
    pipelineId: string,
    error: string,
    projectId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.events) return;
    await this.events.emitPipelineFailed(
      pipelineId,
      error,
      projectId,
      metadata,
    );
  }

  getEvaluator(): AgentEvaluator {
    return this.evaluator;
  }

  getMemoryBridge(): AgentMemoryBridge {
    return this.memoryBridge;
  }

  getDecisionEngine(): AgentDecisionEngine {
    return this.decisionEngine;
  }
}
