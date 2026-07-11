/**
 * Multi-Agent Collaboration Types.
 */

import { randomUUID } from "crypto";

export type AgentRole =
  | "gameplay"
  | "economy"
  | "ui"
  | "quest"
  | "narrative"
  | "performance"
  | "security"
  | "reviewer";

export type MessageType =
  | "proposal"
  | "review_request"
  | "rejection"
  | "alternative"
  | "approval"
  | "consensus";
export type TaskStatus =
  "pending" | "assigned" | "running" | "review" | "completed" | "rejected";

export interface AgentContext {
  agentId: string;
  role: AgentRole;
  projectId: string;
  blueprint: Record<string, unknown>;
  knowledge: Record<string, unknown>;
  repairHistory: unknown[];
  playtestReport: unknown;
  experienceManifest: unknown;
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string | "all";
  type: MessageType;
  subject: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  resolved: boolean;
}

export interface AgentTask {
  id: string;
  assignee: AgentRole;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  createdAt: number;
  completedAt?: number;
  output?: unknown;
}

export interface AgentResult {
  agentId: string;
  role: AgentRole;
  taskId: string;
  success: boolean;
  output: Record<string, unknown>;
  tokens: number;
  cost: number;
  duration: number;
}

export interface AgentMetrics {
  agentId: string;
  role: AgentRole;
  successRate: number;
  averageScore: number;
  averageTokens: number;
  averageCost: number;
  repairCount: number;
  tasksCompleted: number;
}

export interface ConsensusDecision {
  id: string;
  topic: string;
  proposals: Array<{ agentId: string; proposal: string }>;
  decision: string;
  decidedBy: string;
  timestamp: number;
}

export function createMessageId(): string {
  return `msg-${randomUUID().slice(0, 10)}`;
}
export function createTaskId(): string {
  return `task-${randomUUID().slice(0, 10)}`;
}
