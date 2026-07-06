/**
 * BaseAgentV2.ts — Abstract base for orchestrated agents (v2.7).
 * Provider-agnostic: future LLM providers plug in behind execute().
 */

import type { AgentCapability } from "./types";

export interface AgentInput {
  task: string;
  context: Record<string, unknown>;
}
export interface AgentOutput {
  agentId: string;
  success: boolean;
  outputs: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

export abstract class BaseAgentV2 {
  abstract readonly agentId: string;
  abstract readonly capability: AgentCapability;

  abstract execute(input: AgentInput): Promise<AgentOutput>;

  canHandle(task: string): boolean {
    return this.capability.supportedTasks.includes(task);
  }
}
