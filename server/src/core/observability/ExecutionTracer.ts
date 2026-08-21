/**
 * ExecutionTracer.ts
 *
 * Central tracing facade for PlanExecutor steps.
 * Emits ExecutionTraceEvents to the TraceStore and optional live listeners.
 *
 * Usage:
 *   const tracer = ExecutionTracer.instance();
 *   tracer.startExecution(planId, goal, nodeCount);
 *   tracer.traceNodeStart(executionId, nodeId, agentId, input);
 *   tracer.traceNodeComplete(executionId, nodeId, agentId, output, durationMs, evalScore);
 *   tracer.traceNodeFailed(executionId, nodeId, agentId, error, durationMs);
 *   tracer.completeExecution(executionId, outputs);
 */

import type { ExecutionTraceEvent, ExecutionTrace } from "./types";
import { TraceStore } from "./TraceStore";

export type TraceListener = (event: ExecutionTraceEvent) => void;

export class ExecutionTracer {
  private static _instance: ExecutionTracer | null = null;
  private store: TraceStore;
  private listeners: TraceListener[] = [];

  constructor(store?: TraceStore) {
    this.store = store ?? TraceStore.instance();
  }

  static instance(): ExecutionTracer {
    if (!ExecutionTracer._instance) {
      ExecutionTracer._instance = new ExecutionTracer();
    }
    return ExecutionTracer._instance;
  }

  static resetInstance(): void {
    ExecutionTracer._instance = null;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  startExecution(
    executionId: string,
    planId: string,
    goal: string,
    nodeCount: number,
    projectId?: string,
  ): void {
    const trace: ExecutionTrace = {
      executionId,
      projectId,
      planId,
      goal,
      startedAt: Date.now(),
      status: "running",
      events: [],
      nodeCount,
      completedNodes: 0,
      failedNodes: 0,
    };
    this.store.createTrace(trace);

    this.emit({
      executionId,
      nodeId: "__plan__",
      agentId: "__system__",
      eventType: "plan.started",
      timestamp: Date.now(),
      metadata: { planId, goal, nodeCount },
    });
  }

  completeExecution(
    executionId: string,
    outputs: Record<string, unknown>,
    success: boolean,
  ): void {
    const completedAt = Date.now();
    this.store.updateTrace(executionId, {
      status: success ? "completed" : "failed",
      completedAt,
      outputs,
    });

    const trace = this.store.getTrace(executionId);
    if (trace) {
      trace.totalDurationMs = completedAt - trace.startedAt;
    }

    this.emit({
      executionId,
      nodeId: "__plan__",
      agentId: "__system__",
      eventType: success ? "plan.completed" : "plan.failed",
      timestamp: completedAt,
      durationMs: trace?.totalDurationMs,
      metadata: {
        success,
        completedNodes: trace?.completedNodes,
        failedNodes: trace?.failedNodes,
      },
    });
  }

  // ─── Node Events ───────────────────────────────────────────────────────

  traceNodeStart(
    executionId: string,
    nodeId: string,
    agentId: string,
    input: unknown,
  ): void {
    this.emit({
      executionId,
      nodeId,
      agentId,
      eventType: "node.started",
      timestamp: Date.now(),
      input,
    });
  }

  traceNodeComplete(
    executionId: string,
    nodeId: string,
    agentId: string,
    output: unknown,
    durationMs: number,
    evaluationScore?: number,
    evaluationPassed?: boolean,
  ): void {
    this.store.updateTrace(executionId, {
      completedNodes:
        (this.store.getTrace(executionId)?.completedNodes ?? 0) + 1,
    });

    this.emit({
      executionId,
      nodeId,
      agentId,
      eventType: "node.completed",
      timestamp: Date.now(),
      output,
      durationMs,
      evaluationScore,
      evaluationPassed,
    });
  }

  traceNodeFailed(
    executionId: string,
    nodeId: string,
    agentId: string,
    error: string,
    durationMs: number,
  ): void {
    this.store.updateTrace(executionId, {
      failedNodes: (this.store.getTrace(executionId)?.failedNodes ?? 0) + 1,
    });

    this.emit({
      executionId,
      nodeId,
      agentId,
      eventType: "node.failed",
      timestamp: Date.now(),
      error,
      durationMs,
    });
  }

  // ─── Supplementary Events ─────────────────────────────────────────────

  traceMemoryInjection(
    executionId: string,
    nodeId: string,
    agentId: string,
    memoryDelta: unknown,
  ): void {
    this.emit({
      executionId,
      nodeId,
      agentId,
      eventType: "memory.injected",
      timestamp: Date.now(),
      memoryDelta,
    });
  }

  traceEvaluation(
    executionId: string,
    nodeId: string,
    agentId: string,
    score: number,
    passed: boolean,
  ): void {
    this.emit({
      executionId,
      nodeId,
      agentId,
      eventType: "evaluation.scored",
      timestamp: Date.now(),
      evaluationScore: score,
      evaluationPassed: passed,
    });
  }

  // ─── Listeners (live streaming) ───────────────────────────────────────

  addListener(listener: TraceListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: TraceListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  /**
   * SEC-REALTIME-TRACE-001. Every emitted event carries the project of its own
   * execution, resolved here rather than threaded through each trace method, so
   * a trace method added later cannot forget to carry it. Consumers use it to
   * deliver only to the tenant the execution belongs to; a payload here names
   * the execution, the node, the agent, its evaluation score and its errors.
   */
  private emit(event: ExecutionTraceEvent): void {
    const scoped: ExecutionTraceEvent = {
      ...event,
      projectId:
        event.projectId ?? this.store.getTrace(event.executionId)?.projectId,
    };
    this.store.appendEvent(scoped.executionId, scoped);
    for (const listener of this.listeners) {
      try {
        listener(scoped);
      } catch {
        /* Listener errors must never break execution */
      }
    }
  }

  getStore(): TraceStore {
    return this.store;
  }
}
