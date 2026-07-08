/**
 * AI Context types for session-based agent coordination.
 */

import { randomUUID } from "crypto";

export interface SessionContext {
  sessionId: string;
  projectId: string;
  gameBlueprint: Record<string, unknown>;
  activeAgent: string | null;
  previousOutputs: AgentOutput[];
  decisions: Decision[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AgentOutput {
  agentId: string;
  output: Record<string, unknown>;
  timestamp: number;
}

export interface Decision {
  agentId: string;
  type: string;
  description: string;
  timestamp: number;
}

export interface AgentExecutionContext {
  session: SessionContext;
  relevantMemory: unknown[];
  agentId: string;
  input: Record<string, unknown>;
}

export function createSessionId(): string {
  return `session-${randomUUID().slice(0, 12)}`;
}
