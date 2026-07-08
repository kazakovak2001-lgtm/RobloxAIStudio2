/**
 * ContextValidator — Validates session context integrity.
 */

import type { SessionContext } from "./ContextTypes";

export interface ContextValidationResult {
  valid: boolean;
  errors: string[];
}

export class ContextValidator {
  validate(context: SessionContext | null): ContextValidationResult {
    const errors: string[] = [];
    if (!context) {
      errors.push("Context is null");
      return { valid: false, errors };
    }
    if (!context.sessionId) errors.push("Missing sessionId");
    if (!context.projectId) errors.push("Missing projectId");
    if (
      typeof context.gameBlueprint !== "object" ||
      context.gameBlueprint === null
    )
      errors.push("gameBlueprint must be an object");
    if (!Array.isArray(context.previousOutputs))
      errors.push("previousOutputs must be an array");
    if (!Array.isArray(context.decisions))
      errors.push("decisions must be an array");
    return { valid: errors.length === 0, errors };
  }

  validateForAgent(
    context: SessionContext | null,
    agentId: string,
    requiredKeys: string[],
  ): ContextValidationResult {
    const base = this.validate(context);
    if (!base.valid) return base;
    const errors: string[] = [];
    const accumulated = this.getAccumulated(context!);
    for (const key of requiredKeys) {
      if (
        !(key in accumulated) ||
        accumulated[key] === undefined ||
        accumulated[key] === ""
      ) {
        errors.push(`Agent "${agentId}" requires "${key}" in context`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private getAccumulated(context: SessionContext): Record<string, unknown> {
    const result: Record<string, unknown> = { ...context.gameBlueprint };
    for (const output of context.previousOutputs)
      Object.assign(result, output.output);
    return result;
  }
}
