/**
 * CompilerErrorBoundary.ts
 *
 * Unified error handling system for the production compiler platform.
 * Classifies, wraps, and normalizes all errors.
 * Prevents pipeline crash propagation — all errors become structured responses.
 */

export type CompilerErrorKind =
  | "ValidationError"
  | "ExecutionError"
  | "GovernanceError"
  | "SystemError"
  | "TimeoutError";

export interface CompilerError {
  kind: CompilerErrorKind;
  code: string;
  message: string;
  stage?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  recoverable: boolean;
}

export class CompilerErrorBoundary {
  /**
   * Wrap any error into a structured CompilerError.
   */
  static capture(
    error: unknown,
    stage?: string,
    kind?: CompilerErrorKind,
  ): CompilerError {
    const message = error instanceof Error ? error.message : String(error);
    const errorKind = kind ?? CompilerErrorBoundary.classify(error, stage);

    return {
      kind: errorKind,
      code: `${errorKind.toUpperCase()}_${(stage ?? "UNKNOWN").toUpperCase()}`,
      message,
      stage,
      details: error instanceof Error ? { stack: error.stack } : undefined,
      timestamp: new Date(),
      recoverable: errorKind !== "SystemError",
    };
  }

  /**
   * Execute a function within an error boundary.
   * Returns { success, data?, error? } — never throws.
   */
  static async safe<T>(
    fn: () => Promise<T>,
    stage: string,
  ): Promise<
    { success: true; data: T } | { success: false; error: CompilerError }
  > {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(err, stage),
      };
    }
  }

  /**
   * Synchronous version of safe().
   */
  static safeSync<T>(
    fn: () => T,
    stage: string,
  ): { success: true; data: T } | { success: false; error: CompilerError } {
    try {
      const data = fn();
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: CompilerErrorBoundary.capture(err, stage),
      };
    }
  }

  private static classify(error: unknown, stage?: string): CompilerErrorKind {
    const msg = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      msg.includes("validation") ||
      msg.includes("schema") ||
      msg.includes("missing")
    ) {
      return "ValidationError";
    }
    if (
      msg.includes("governance") ||
      msg.includes("policy") ||
      msg.includes("blocked")
    ) {
      return "GovernanceError";
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return "TimeoutError";
    }
    if (stage) return "ExecutionError";
    return "SystemError";
  }
}
