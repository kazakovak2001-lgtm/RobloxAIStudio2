/**
 * AgentRuntime — Governs agent execution lifecycle.
 */

import { AgentValidator, type ValidationResult } from "./AgentValidator";
import { ExecutionPolicy } from "./ExecutionPolicy";
import { getGovernanceAgentRegistry } from "../agents";
import { randomUUID } from "crypto";

export interface ExecutionRecord {
  executionId: string;
  agentId: string;
  promptVersion: string;
  inputHash: string;
  outputHash: string;
  executionTimeMs: number;
  validationResult: ValidationResult;
  timestamp: number;
  success: boolean;
}

export class AgentRuntime {
  private policy: ExecutionPolicy;
  private validator: AgentValidator;
  private history: ExecutionRecord[] = [];
  private maxHistory = 500;

  constructor(policy?: ExecutionPolicy) {
    this.policy = policy ?? new ExecutionPolicy();
    this.validator = new AgentValidator(this.policy);
  }

  /**
   * Validate and record an agent execution.
   */
  validateAndRecord(params: {
    agentId: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    executionTimeMs: number;
    success: boolean;
  }): {
    preValidation: ValidationResult;
    postValidation: ValidationResult;
    record: ExecutionRecord;
  } {
    const registry = getGovernanceAgentRegistry();
    const meta = registry.get(params.agentId);

    const preValidation = this.validator.validatePreExecution(
      params.agentId,
      params.input,
    );
    const postValidation = params.success
      ? this.validator.validatePostExecution(params.agentId, params.output)
      : { valid: true, errors: [] };

    const record: ExecutionRecord = {
      executionId: randomUUID().slice(0, 12),
      agentId: params.agentId,
      promptVersion: meta?.promptId ?? "unknown",
      inputHash: this.hash(params.input),
      outputHash: this.hash(params.output),
      executionTimeMs: params.executionTimeMs,
      validationResult: postValidation,
      timestamp: Date.now(),
      success: params.success,
    };

    this.history.push(record);
    if (this.history.length > this.maxHistory) this.history.shift();

    return { preValidation, postValidation, record };
  }

  /**
   * Pre-execution validation only.
   */
  validateBeforeExecution(
    agentId: string,
    context: Record<string, unknown>,
  ): ValidationResult {
    return this.validator.validatePreExecution(agentId, context);
  }

  getHistory(agentId?: string): ExecutionRecord[] {
    if (!agentId) return [...this.history];
    return this.history.filter((r) => r.agentId === agentId);
  }

  getPolicy(): ExecutionPolicy {
    return this.policy;
  }
  get historyCount(): number {
    return this.history.length;
  }

  private hash(obj: Record<string, unknown>): string {
    const str = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
}
