/**
 * FailureModeRegistry.ts
 *
 * Defines all known failure modes with:
 *   - Severity classification
 *   - Recovery strategy
 *   - Escalation policy
 *
 * Categories:
 *   - Deterministic: schema mismatch, missing input, invalid config
 *   - Probabilistic: agent inconsistency, LLM hallucination, quality drift
 *   - System: timeout, deadlock, OOM, network failure
 */

export type FailureSeverity = "low" | "medium" | "high" | "critical";
export type RecoveryStrategy =
  | "retry"
  | "fallback-agent"
  | "skip"
  | "abort"
  | "checkpoint-resume"
  | "manual";

export interface FailureMode {
  id: string;
  category: "deterministic" | "probabilistic" | "system";
  name: string;
  description: string;
  severity: FailureSeverity;
  recoveryStrategy: RecoveryStrategy;
  maxRetries: number;
  escalationPolicy: string;
  detectionSignal: string;
}

export class FailureModeRegistry {
  private modes: Map<string, FailureMode> = new Map();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Register a failure mode.
   */
  register(mode: FailureMode): void {
    this.modes.set(mode.id, mode);
  }

  /**
   * Get a failure mode by ID.
   */
  get(id: string): FailureMode | undefined {
    return this.modes.get(id);
  }

  /**
   * Get all failure modes.
   */
  getAll(): FailureMode[] {
    return [...this.modes.values()];
  }

  /**
   * Get failure modes by category.
   */
  getByCategory(category: FailureMode["category"]): FailureMode[] {
    return this.getAll().filter((m) => m.category === category);
  }

  /**
   * Get failure modes by severity.
   */
  getBySeverity(severity: FailureSeverity): FailureMode[] {
    return this.getAll().filter((m) => m.severity === severity);
  }

  /**
   * Look up the recommended recovery for a failure type.
   */
  getRecovery(
    failureType: string,
  ): { strategy: RecoveryStrategy; maxRetries: number } | null {
    const mode = this.modes.get(failureType);
    if (!mode) return null;
    return { strategy: mode.recoveryStrategy, maxRetries: mode.maxRetries };
  }

  /**
   * Export registry as JSON.
   */
  exportJson(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  get size(): number {
    return this.modes.size;
  }

  // ─── Default Failure Modes ────────────────────────────────────────────

  private registerDefaults(): void {
    const defaults: FailureMode[] = [
      // Deterministic
      {
        id: "schema-mismatch",
        category: "deterministic",
        name: "Schema Mismatch",
        description: "Agent output does not conform to expected schema",
        severity: "high",
        recoveryStrategy: "retry",
        maxRetries: 2,
        escalationPolicy:
          "Block pipeline if retry fails. Log full output for debugging.",
        detectionSignal: "JSON schema validation failure on agent output",
      },
      {
        id: "missing-input",
        category: "deterministic",
        name: "Missing Required Input",
        description: "A pipeline stage received input without required fields",
        severity: "critical",
        recoveryStrategy: "abort",
        maxRetries: 0,
        escalationPolicy: "Immediate abort. Indicates broken upstream stage.",
        detectionSignal: "Input validation fails on required field check",
      },
      {
        id: "invalid-config",
        category: "deterministic",
        name: "Invalid Configuration",
        description: "Runtime configuration is invalid or missing",
        severity: "critical",
        recoveryStrategy: "abort",
        maxRetries: 0,
        escalationPolicy: "Cannot proceed. Fix configuration before retry.",
        detectionSignal: "Config parsing throws or returns null",
      },
      {
        id: "non-json-output",
        category: "deterministic",
        name: "Non-JSON Output",
        description: "Agent returned output that is not JSON-serializable",
        severity: "high",
        recoveryStrategy: "retry",
        maxRetries: 1,
        escalationPolicy: "If retry fails, mark agent as degraded.",
        detectionSignal: "JSON.stringify throws on agent output",
      },
      // Probabilistic
      {
        id: "agent-inconsistency",
        category: "probabilistic",
        name: "Agent Inconsistency",
        description: "Agent produces different quality outputs for same input",
        severity: "medium",
        recoveryStrategy: "retry",
        maxRetries: 2,
        escalationPolicy: "After 2 retries, use best-of-N selection.",
        detectionSignal: "Evaluation score variance > 30 across runs",
      },
      {
        id: "llm-hallucination",
        category: "probabilistic",
        name: "LLM Hallucination",
        description:
          "LLM generates structurally valid but semantically incorrect output",
        severity: "medium",
        recoveryStrategy: "fallback-agent",
        maxRetries: 1,
        escalationPolicy: "Switch to alternate agent with different prompt.",
        detectionSignal: "Evaluation passes schema but fails semantic checks",
      },
      {
        id: "quality-drift",
        category: "probabilistic",
        name: "Quality Drift",
        description: "Agent scores gradually declining over time",
        severity: "low",
        recoveryStrategy: "fallback-agent",
        maxRetries: 0,
        escalationPolicy:
          "Log trend. Switch agent after 5 consecutive score drops.",
        detectionSignal: "Moving average score drops below threshold",
      },
      {
        id: "low-score",
        category: "probabilistic",
        name: "Low Evaluation Score",
        description: "Agent output scores below acceptance threshold",
        severity: "medium",
        recoveryStrategy: "retry",
        maxRetries: 2,
        escalationPolicy:
          "After retries, accept best attempt with degraded flag.",
        detectionSignal: "Evaluation score < 50",
      },
      // System
      {
        id: "timeout",
        category: "system",
        name: "Execution Timeout",
        description: "Agent or stage exceeded maximum allowed duration",
        severity: "high",
        recoveryStrategy: "retry",
        maxRetries: 1,
        escalationPolicy:
          "If timeout persists, mark node as failed and continue.",
        detectionSignal: "Execution duration > stage.maxDurationMs",
      },
      {
        id: "deadlock",
        category: "system",
        name: "Pipeline Deadlock",
        description:
          "Execution stuck with no progress (no ready nodes, not complete)",
        severity: "critical",
        recoveryStrategy: "abort",
        maxRetries: 0,
        escalationPolicy:
          "Immediate abort. Indicates DAG cycle or unsatisfied dependency.",
        detectionSignal:
          "getReadyNodes() returns empty while graph.isComplete() is false",
      },
      {
        id: "oom-estimate",
        category: "system",
        name: "Memory Pressure",
        description: "Estimated memory footprint exceeds safe limit",
        severity: "high",
        recoveryStrategy: "checkpoint-resume",
        maxRetries: 1,
        escalationPolicy:
          "Checkpoint, release resources, resume from checkpoint.",
        detectionSignal: "memoryFootprintEstimate > threshold",
      },
      {
        id: "network-failure",
        category: "system",
        name: "Network/IO Failure",
        description: "External service call failed (LLM API, Studio bridge)",
        severity: "high",
        recoveryStrategy: "retry",
        maxRetries: 3,
        escalationPolicy:
          "Exponential backoff. After 3 fails, mark external dependency as down.",
        detectionSignal: "HTTP/WebSocket error from external service",
      },
    ];

    for (const mode of defaults) {
      this.register(mode);
    }
  }
}
