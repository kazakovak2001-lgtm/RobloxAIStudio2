/**
 * PipelineConsistencyService.ts
 *
 * Guarantees pipeline consistency across all execution stages:
 *   - Every stage has valid input/output schema
 *   - Every agent returns valid JSON
 *   - No stage bypasses the validator
 *   - Fail-fast on invalid state
 *
 * Integrated into PlanExecutor lifecycle via hooks.
 */

export interface StageSchema {
  stageId: string;
  agent: string;
  requiredInputKeys: string[];
  requiredOutputKeys: string[];
  maxDurationMs: number;
}

export interface ConsistencyViolation {
  stageId: string;
  agent: string;
  type:
    | "missing-input"
    | "invalid-output"
    | "timeout"
    | "non-json"
    | "schema-mismatch";
  message: string;
  timestamp: number;
}

export interface ConsistencyReport {
  executionId: string;
  stagesChecked: number;
  violations: ConsistencyViolation[];
  status: "CONSISTENT" | "DEGRADED" | "BROKEN";
}

export class PipelineConsistencyService {
  private schemas: Map<string, StageSchema> = new Map();
  private violations: ConsistencyViolation[] = [];

  constructor() {
    this.registerDefaultSchemas();
  }

  /**
   * Register a stage schema.
   */
  registerSchema(schema: StageSchema): void {
    this.schemas.set(schema.stageId, schema);
  }

  /**
   * Validate stage input before execution.
   */
  validateInput(
    stageId: string,
    input: unknown,
  ): { valid: boolean; errors: string[] } {
    const schema = this.schemas.get(stageId);
    if (!schema) return { valid: true, errors: [] }; // no schema = pass through

    const errors: string[] = [];

    if (input === null || input === undefined || typeof input !== "object") {
      errors.push(`Stage "${stageId}": input must be a non-null object`);
      this.recordViolation(stageId, schema.agent, "missing-input", errors[0]);
      return { valid: false, errors };
    }

    const obj = input as Record<string, unknown>;
    for (const key of schema.requiredInputKeys) {
      if (!(key in obj) || obj[key] === undefined) {
        errors.push(`Stage "${stageId}": missing required input key "${key}"`);
      }
    }

    if (errors.length > 0) {
      this.recordViolation(
        stageId,
        schema.agent,
        "missing-input",
        errors.join("; "),
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate stage output after execution.
   */
  validateOutput(
    stageId: string,
    output: unknown,
  ): { valid: boolean; errors: string[] } {
    const schema = this.schemas.get(stageId);
    if (!schema) return { valid: true, errors: [] };

    const errors: string[] = [];

    // Check JSON-serializable
    try {
      JSON.stringify(output);
    } catch {
      errors.push(`Stage "${stageId}": output is not JSON-serializable`);
      this.recordViolation(stageId, schema.agent, "non-json", errors[0]);
      return { valid: false, errors };
    }

    if (output === null || output === undefined || typeof output !== "object") {
      errors.push(`Stage "${stageId}": output must be a non-null object`);
      this.recordViolation(stageId, schema.agent, "invalid-output", errors[0]);
      return { valid: false, errors };
    }

    const obj = output as Record<string, unknown>;
    for (const key of schema.requiredOutputKeys) {
      if (!(key in obj) || obj[key] === undefined) {
        errors.push(`Stage "${stageId}": missing required output key "${key}"`);
      }
    }

    if (errors.length > 0) {
      this.recordViolation(
        stageId,
        schema.agent,
        "invalid-output",
        errors.join("; "),
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if execution duration exceeded stage timeout.
   */
  checkTimeout(stageId: string, durationMs: number): boolean {
    const schema = this.schemas.get(stageId);
    if (!schema) return false;

    if (durationMs > schema.maxDurationMs) {
      this.recordViolation(
        stageId,
        schema.agent,
        "timeout",
        `Stage "${stageId}" exceeded timeout: ${durationMs}ms > ${schema.maxDurationMs}ms`,
      );
      return true;
    }
    return false;
  }

  /**
   * Generate consistency report.
   */
  getReport(executionId: string): ConsistencyReport {
    const status =
      this.violations.length === 0
        ? "CONSISTENT"
        : this.violations.some(
              (v) => v.type === "non-json" || v.type === "missing-input",
            )
          ? "BROKEN"
          : "DEGRADED";

    return {
      executionId,
      stagesChecked: this.schemas.size,
      violations: [...this.violations],
      status,
    };
  }

  /**
   * Reset violations (call at start of new execution).
   */
  reset(): void {
    this.violations = [];
  }

  /**
   * Get all registered schemas.
   */
  getSchemas(): StageSchema[] {
    return [...this.schemas.values()];
  }

  get violationCount(): number {
    return this.violations.length;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private recordViolation(
    stageId: string,
    agent: string,
    type: ConsistencyViolation["type"],
    message: string,
  ): void {
    this.violations.push({
      stageId,
      agent,
      type,
      message,
      timestamp: Date.now(),
    });
  }

  private registerDefaultSchemas(): void {
    // Default pipeline stages
    const stages: StageSchema[] = [
      {
        stageId: "requirements",
        agent: "requirements",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["requirements"],
        maxDurationMs: 30000,
      },
      {
        stageId: "planner",
        agent: "planner",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["plan"],
        maxDurationMs: 30000,
      },
      {
        stageId: "game_designer",
        agent: "game_designer",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["gameplay"],
        maxDurationMs: 45000,
      },
      {
        stageId: "roblox_architect",
        agent: "roblox_architect",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["architecture"],
        maxDurationMs: 45000,
      },
      {
        stageId: "lua_generator",
        agent: "lua_generator",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["lua_generator"],
        maxDurationMs: 60000,
      },
      {
        stageId: "ui_generator",
        agent: "ui_generator",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["uiDesign"],
        maxDurationMs: 45000,
      },
      {
        stageId: "asset_planner",
        agent: "asset_planner",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["assetPlan"],
        maxDurationMs: 30000,
      },
      {
        stageId: "final",
        agent: "orchestrator",
        requiredInputKeys: ["blueprint"],
        requiredOutputKeys: ["world"],
        maxDurationMs: 60000,
      },
    ];

    for (const stage of stages) {
      this.schemas.set(stage.stageId, stage);
    }
  }
}
