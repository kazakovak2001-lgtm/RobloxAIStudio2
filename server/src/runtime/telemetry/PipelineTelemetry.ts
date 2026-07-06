/**
 * PipelineTelemetry.ts
 *
 * Production-ready telemetry for pipeline execution.
 * Emits structured events and maintains per-execution metrics.
 *
 * Exports:
 *   - telemetry.json (per-execution data)
 *   - Aggregated metrics for /api/analytics
 */

export interface TelemetryEvent {
  executionId: string;
  eventType: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ExecutionTelemetry {
  executionId: string;
  intent: string;
  startedAt: number;
  completedAt?: number;
  success?: boolean;
  totalDurationMs?: number;
  phaseTimings: Record<string, number>;
  agentCallCount: number;
  events: TelemetryEvent[];
}

export class PipelineTelemetry {
  private executions: Map<string, ExecutionTelemetry> = new Map();
  private maxExecutions = 200;
  private insertionOrder: string[] = [];

  /**
   * Start tracking a new execution.
   */
  startExecution(executionId: string, intent: string): void {
    this.evictIfNeeded();
    const telemetry: ExecutionTelemetry = {
      executionId,
      intent,
      startedAt: Date.now(),
      phaseTimings: {},
      agentCallCount: 0,
      events: [],
    };
    this.executions.set(executionId, telemetry);
    this.insertionOrder.push(executionId);
    this.emitEvent(executionId, "execution.started", { intent });
  }

  /**
   * Record phase completion timing.
   */
  logPhase(executionId: string, phase: string, durationMs: number): void {
    const tel = this.executions.get(executionId);
    if (tel) {
      tel.phaseTimings[phase] = durationMs;
      this.emitEvent(executionId, "phase.completed", { phase, durationMs });
    }
  }

  /**
   * Log a generic event.
   */
  logEvent(
    executionId: string,
    eventType: string,
    data: Record<string, unknown> = {},
  ): void {
    this.emitEvent(executionId, eventType, data);
  }

  /**
   * Increment agent call counter.
   */
  incrementAgentCalls(executionId: string): void {
    const tel = this.executions.get(executionId);
    if (tel) tel.agentCallCount++;
  }

  /**
   * Get current agent call count.
   */
  getAgentCallCount(executionId: string): number {
    return this.executions.get(executionId)?.agentCallCount ?? 0;
  }

  /**
   * Mark execution as complete.
   */
  completeExecution(
    executionId: string,
    success: boolean,
    totalDurationMs: number,
  ): void {
    const tel = this.executions.get(executionId);
    if (tel) {
      tel.completedAt = Date.now();
      tel.success = success;
      tel.totalDurationMs = totalDurationMs;
      this.emitEvent(executionId, "execution.completed", {
        success,
        totalDurationMs,
      });
    }
  }

  /**
   * Get telemetry for a specific execution.
   */
  getExecution(executionId: string): ExecutionTelemetry | null {
    return this.executions.get(executionId) ?? null;
  }

  /**
   * Get all execution telemetries.
   */
  listExecutions(): ExecutionTelemetry[] {
    return [...this.executions.values()];
  }

  /**
   * Export telemetry as JSON string.
   */
  exportJson(executionId?: string): string {
    if (executionId) {
      const tel = this.executions.get(executionId);
      return tel ? JSON.stringify(tel, null, 2) : "{}";
    }
    return JSON.stringify(this.listExecutions(), null, 2);
  }

  /**
   * Get aggregated metrics across all executions.
   */
  getAggregateMetrics(): {
    totalExecutions: number;
    successRate: number;
    averageDurationMs: number;
    averageAgentCalls: number;
    totalAgentCalls: number;
  } {
    const all = this.listExecutions().filter(
      (t) => t.completedAt !== undefined,
    );
    if (all.length === 0) {
      return {
        totalExecutions: 0,
        successRate: 0,
        averageDurationMs: 0,
        averageAgentCalls: 0,
        totalAgentCalls: 0,
      };
    }

    const successCount = all.filter((t) => t.success).length;
    const totalDuration = all.reduce(
      (sum, t) => sum + (t.totalDurationMs ?? 0),
      0,
    );
    const totalCalls = all.reduce((sum, t) => sum + t.agentCallCount, 0);

    return {
      totalExecutions: all.length,
      successRate: successCount / all.length,
      averageDurationMs: Math.round(totalDuration / all.length),
      averageAgentCalls: Math.round(totalCalls / all.length),
      totalAgentCalls: totalCalls,
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private emitEvent(
    executionId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): void {
    const tel = this.executions.get(executionId);
    if (tel) {
      tel.events.push({ executionId, eventType, timestamp: Date.now(), data });
    }
  }

  private evictIfNeeded(): void {
    while (
      this.executions.size >= this.maxExecutions &&
      this.insertionOrder.length > 0
    ) {
      const oldest = this.insertionOrder.shift()!;
      this.executions.delete(oldest);
    }
  }
}
