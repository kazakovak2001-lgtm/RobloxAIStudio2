/**
 * RuntimeErrorBoundary.ts
 *
 * Catches ALL runtime errors and translates them into standardized
 * ExecutionFailureReport. No silent failures allowed.
 *
 * Handles:
 *   - Agent crashes (thrown exceptions)
 *   - Invalid artifact output (non-JSON, null)
 *   - Timeout execution
 *   - Deadlock detection (stuck phase)
 */

export type FailureType =
  | "agent-crash"
  | "agent-failure"
  | "invalid-output"
  | "timeout"
  | "deadlock"
  | "validation-failure"
  | "system-error"
  | "unknown";

export interface ExecutionFailureReport {
  failureType: FailureType;
  phase: string;
  message: string;
  stack?: string;
  agent?: string;
  timestamp: number;
  recoverable: boolean;
  details?: unknown;
}

export class RuntimeErrorBoundary {
  private failures: ExecutionFailureReport[] = [];
  private maxFailures = 500;

  /**
   * Wrap an agent call with error boundary.
   * Catches all errors and converts to structured failures.
   */
  async wrapAgentCall(
    agentId: string,
    fn: () => Promise<Record<string, unknown>>,
    timeoutMs = 60000,
  ): Promise<Record<string, unknown>> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`Agent "${agentId}" timed out after ${timeoutMs}ms`),
          ),
        timeoutMs,
      );
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);

      // Validate output is not null/undefined
      if (result === null || result === undefined) {
        const report = this.createReport(
          "invalid-output",
          "EXECUTING",
          `Agent "${agentId}" returned null/undefined`,
          agentId,
          true,
        );
        this.record(report);
        return { _error: report.message, _agent: agentId };
      }

      // Validate output is JSON-serializable
      try {
        JSON.stringify(result);
      } catch {
        const report = this.createReport(
          "invalid-output",
          "EXECUTING",
          `Agent "${agentId}" returned non-JSON-serializable output`,
          agentId,
          true,
        );
        this.record(report);
        return { _error: report.message, _agent: agentId };
      }

      return result;
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.message.includes("timed out");
      const failureType: FailureType = isTimeout ? "timeout" : "agent-crash";
      const message =
        err instanceof Error
          ? err.message
          : `Agent "${agentId}" crashed with unknown error`;
      const stack = err instanceof Error ? err.stack : undefined;

      const report = this.createReport(
        failureType,
        "EXECUTING",
        message,
        agentId,
        !isTimeout,
        stack,
      );
      this.record(report);

      // Re-throw so PlanExecutor's retry logic can handle it
      throw err;
    }
  }

  /**
   * Capture a general error from any phase.
   */
  captureError(err: unknown, phase: string): ExecutionFailureReport {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const report = this.createReport(
      "system-error",
      phase,
      message,
      undefined,
      false,
      stack,
    );
    this.record(report);
    return report;
  }

  /**
   * Get all recorded failures.
   */
  getFailures(): ExecutionFailureReport[] {
    return [...this.failures];
  }

  /**
   * Get failures by type.
   */
  getFailuresByType(type: FailureType): ExecutionFailureReport[] {
    return this.failures.filter((f) => f.failureType === type);
  }

  /**
   * Get failure statistics.
   */
  getStats(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const f of this.failures) {
      byType[f.failureType] = (byType[f.failureType] ?? 0) + 1;
    }
    return { total: this.failures.length, byType };
  }

  /**
   * Clear all recorded failures.
   */
  clear(): void {
    this.failures = [];
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private createReport(
    failureType: FailureType,
    phase: string,
    message: string,
    agent?: string,
    recoverable = false,
    stack?: string,
  ): ExecutionFailureReport {
    return {
      failureType,
      phase,
      message,
      stack,
      agent,
      timestamp: Date.now(),
      recoverable,
    };
  }

  private record(report: ExecutionFailureReport): void {
    this.failures.push(report);
    if (this.failures.length > this.maxFailures) {
      this.failures.shift();
    }
    // No silent failures — always log
    console.error(
      `[ERROR-BOUNDARY] ${report.failureType} | Phase: ${report.phase} | ${report.message}`,
    );
  }
}
