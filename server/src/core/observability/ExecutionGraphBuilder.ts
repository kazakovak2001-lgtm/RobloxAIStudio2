/**
 * ExecutionGraphBuilder.ts
 *
 * Transforms execution trace events into a DAG visualization structure.
 * Builds the canonical execution graph:
 *   PlannerEngine → PlanExecutor → Agent Nodes → Evaluation → Memory → Artifacts
 *
 * Consumers:
 *   - /api/debug/graph/:id endpoint
 *   - Frontend DAG visualizer
 *   - Execution replay comparisons
 */

import type {
  ExecutionGraph,
  ExecutionGraphNode,
  ExecutionGraphEdge,
  ExecutionTrace,
  ExecutionTraceEvent,
} from "./types";
import { TraceStore } from "./TraceStore";

export class ExecutionGraphBuilder {
  private store: TraceStore;

  constructor(store?: TraceStore) {
    this.store = store ?? TraceStore.instance();
  }

  /**
   * Build an execution graph from a stored trace.
   */
  buildFromTrace(executionId: string): ExecutionGraph | null {
    const trace = this.store.getTrace(executionId);
    if (!trace) return null;
    return this.buildGraph(trace);
  }

  /**
   * Build an execution graph from a trace object directly.
   */
  buildGraph(trace: ExecutionTrace): ExecutionGraph {
    const nodesMap = new Map<string, ExecutionGraphNode>();
    const edges: ExecutionGraphEdge[] = [];

    // Extract unique nodes from events
    for (const event of trace.events) {
      if (event.nodeId === "__plan__") continue;

      if (!nodesMap.has(event.nodeId)) {
        nodesMap.set(event.nodeId, {
          id: event.nodeId,
          agent: event.agentId,
          status: "pending",
          dependencies: [],
        });
      }

      const node = nodesMap.get(event.nodeId)!;

      // Update node status based on events
      switch (event.eventType) {
        case "node.started":
          node.status = "running";
          break;
        case "node.completed":
          node.status = "done";
          node.durationMs = event.durationMs;
          node.evaluationScore = event.evaluationScore;
          break;
        case "node.failed":
          node.status = "failed";
          node.durationMs = event.durationMs;
          break;
      }
    }

    // Build edges from execution order (temporal dependencies)
    const completedOrder = trace.events
      .filter(
        (e) =>
          e.eventType === "node.completed" || e.eventType === "node.failed",
      )
      .map((e) => e.nodeId);

    // Create sequential edges from the execution order
    for (let i = 1; i < completedOrder.length; i++) {
      edges.push({
        from: completedOrder[i - 1],
        to: completedOrder[i],
      });
    }

    return {
      executionId: trace.executionId,
      nodes: [...nodesMap.values()],
      edges,
    };
  }

  /**
   * Build a textual representation of the execution flow.
   */
  buildFlowText(executionId: string): string {
    const graph = this.buildFromTrace(executionId);
    if (!graph) return "No trace found.";

    const lines: string[] = [
      `Execution: ${graph.executionId}`,
      `Nodes: ${graph.nodes.length}`,
      "",
      "Flow:",
    ];

    for (const node of graph.nodes) {
      const status =
        node.status === "done" ? "✓" : node.status === "failed" ? "✗" : "○";
      const duration = node.durationMs ? ` (${node.durationMs}ms)` : "";
      const score =
        node.evaluationScore !== undefined
          ? ` [score: ${node.evaluationScore}]`
          : "";
      lines.push(`  ${status} ${node.agent} (${node.id})${duration}${score}`);
    }

    return lines.join("\n");
  }

  /**
   * Get the canonical execution path description.
   */
  getExecutionPath(): string {
    return "PlannerEngine → PlanExecutor → Agent Nodes → Evaluation → Memory → Artifacts";
  }

  /**
   * Generate a timeline of events for a specific execution.
   */
  buildTimeline(
    executionId: string,
  ): Array<{ time: number; event: string; agent: string; detail: string }> {
    const trace = this.store.getTrace(executionId);
    if (!trace) return [];

    const baseTime = trace.startedAt;
    return trace.events.map((event) => ({
      time: event.timestamp - baseTime,
      event: event.eventType,
      agent: event.agentId,
      detail: this.formatEventDetail(event),
    }));
  }

  private formatEventDetail(event: ExecutionTraceEvent): string {
    switch (event.eventType) {
      case "node.started":
        return `Started ${event.agentId}`;
      case "node.completed":
        return `Completed in ${event.durationMs}ms (score: ${event.evaluationScore ?? "N/A"})`;
      case "node.failed":
        return `Failed: ${event.error ?? "unknown"}`;
      case "memory.injected":
        return `Memory injected for ${event.agentId}`;
      case "evaluation.scored":
        return `Score: ${event.evaluationScore} (${event.evaluationPassed ? "PASS" : "FAIL"})`;
      case "plan.started":
        return `Plan started (${(event.metadata as Record<string, unknown>)?.nodeCount ?? "?"} nodes)`;
      case "plan.completed":
        return `Plan completed`;
      case "plan.failed":
        return `Plan failed`;
      default:
        return event.eventType;
    }
  }
}
