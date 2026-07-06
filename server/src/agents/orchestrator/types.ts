/**
 * Multi-Agent Orchestration types (v2.7)
 */

import { randomUUID } from "crypto";

// ─── Capability Model ────────────────────────────────────────────────────────

export interface AgentCapability {
  id: string;
  agentId: string;
  supportedTasks: string[];
  requiredInputs: string[];
  producedOutputs: string[];
  dependencies: string[];
  priority: number;
}

// ─── Execution Plan ──────────────────────────────────────────────────────────

export interface AgentExecutionPlan {
  planId: string;
  steps: AgentExecutionStep[];
  totalSteps: number;
  createdAt: number;
}

export interface AgentExecutionStep {
  stepId: string;
  agentId: string;
  task: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  durationMs?: number;
  output?: unknown;
  error?: string;
}

// ─── Execution Context ───────────────────────────────────────────────────────

export interface AgentExecContext {
  planId: string;
  projectId: string;
  intent: string;
  sharedOutputs: Record<string, unknown>;
  completedSteps: string[];
  startedAt: number;
}

// ─── Execution Result ────────────────────────────────────────────────────────

export interface AgentExecResult {
  planId: string;
  success: boolean;
  completedSteps: number;
  failedSteps: number;
  totalDurationMs: number;
  outputs: Record<string, unknown>;
  errors: string[];
}

// ─── Messages ────────────────────────────────────────────────────────────────

export type AgentMessageType = "request" | "response" | "validation" | "status";

export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
}

// ─── Shared Context ──────────────────────────────────────────────────────────

export interface SharedKnowledge {
  key: string;
  value: unknown;
  producedBy: string;
  timestamp: number;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface OrchestrationMetrics {
  agentExecutionTimeMs: Record<string, number>;
  graphSize: number;
  dependencyResolutionMs: number;
  communicationEvents: number;
  artifactExchanges: number;
  validationDurationMs: number;
  totalDurationMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createPlanId(): string {
  return `plan-${randomUUID().slice(0, 8)}`;
}
export function createStepId(): string {
  return `step-${randomUUID().slice(0, 8)}`;
}
export function createMessageId(): string {
  return `msg-${randomUUID().slice(0, 8)}`;
}
