/**
 * AgentValidator — Validates agent execution preconditions and outputs.
 */

import { getGovernanceAgentRegistry } from "../agents";
import type { ExecutionPolicy } from "./ExecutionPolicy";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class AgentValidator {
  private policy: ExecutionPolicy;

  constructor(policy: ExecutionPolicy) {
    this.policy = policy;
  }

  /**
   * Validate before execution: agent exists, context is complete.
   */
  validatePreExecution(
    agentId: string,
    context: Record<string, unknown>,
  ): ValidationResult {
    const errors: string[] = [];
    const registry = getGovernanceAgentRegistry();

    if (!registry.has(agentId)) {
      errors.push(`Agent "${agentId}" not found in governance registry`);
      return { valid: false, errors };
    }

    if (this.policy.requireContextValidation) {
      const ctxResult = registry.validateContext(agentId, context);
      if (!ctxResult.valid) {
        errors.push(
          `Missing required context: ${ctxResult.missing.join(", ")}`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate after execution: output matches expected schema keys.
   */
  validatePostExecution(
    agentId: string,
    output: Record<string, unknown>,
  ): ValidationResult {
    const errors: string[] = [];
    if (!this.policy.requireOutputValidation) return { valid: true, errors };

    const registry = getGovernanceAgentRegistry();
    const meta = registry.get(agentId);
    if (!meta) return { valid: true, errors };

    for (const key of meta.outputSchema) {
      if (!(key in output) || output[key] === undefined) {
        errors.push(`Missing expected output key: "${key}"`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
