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

  constructor(memoryBridge?: AgentMemoryBridge, evaluator?: AgentEvaluator) {
    this.memoryBridge = memoryBridge ?? new AgentMemoryBridge();
    this.evaluator = evaluator ?? new AgentEvaluator();
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

    // Validate DAG before execution
    const { valid, cycles } = graph.validateDAG();
    if (!valid) {
      console.error(
        `[PLAN-EXEC] Invalid DAG — cycles detected: ${cycles.join(", ")}`,
      );
      return this.buildResult(planId, graph, Date.now() - totalStart);
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
          node,
          graph,
          agentExecutor,
          projectId,
          maxRetries,
        );

        if (stopOnFailure && node.status === "failed") {
          console.log(`[PLAN-EXEC] Stopped on failure | Node: ${node.id}`);
          return this.buildResult(planId, graph, Date.now() - totalStart);
        }
      }
    }

    const result = this.buildResult(planId, graph, Date.now() - totalStart);
    console.log(
      `[PLAN-EXEC] Complete | Plan: ${planId} | Success: ${result.success} | Duration: ${result.totalDurationMs}ms`,
    );
    return result;
  }

  private async executeNode(
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
      }
    } catch {
      /* non-blocking */
    }

    // Execute with retry
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      try {
        const output = await agentExecutor(node.agent, input);
        const durationMs = Date.now() - start;

        // Evaluate output quality
        const { evaluation } = await this.evaluator.evaluate(
          node.agent,
          output,
          {
            expectedKeys:
              Object.keys(node.input).length > 0 ? undefined : undefined,
            taskDescription: node.type,
          },
        );

        // Store in memory for future use
        await this.memoryBridge.storeFromAgent(
          node.agent,
          input,
          output,
          projectId,
        );

        graph.markDone(node.id, output, durationMs, {
          quality: evaluation.score.quality,
          passed: evaluation.passed,
        });

        return;
      } catch (err) {
        if (attempts >= maxRetries) {
          const error = err instanceof Error ? err.message : String(err);
          graph.markFailed(node.id, error, Date.now() - start);
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

  getEvaluator(): AgentEvaluator {
    return this.evaluator;
  }

  getMemoryBridge(): AgentMemoryBridge {
    return this.memoryBridge;
  }
}
