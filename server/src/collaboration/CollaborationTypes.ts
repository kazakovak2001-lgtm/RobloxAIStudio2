/**
 * CollaborationTypes.ts — All type definitions for the AI Collaboration Layer.
 */

export type AgentRole =
  "architect" | "designer" | "validator" | "optimizer" | "orchestrator";
export type TaskStatus =
  "pending" | "assigned" | "running" | "completed" | "failed" | "blocked";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface AIAgent {
  agentId: string;
  role: AgentRole;
  name: string;
  capabilities: string[];
  enabled: boolean;
  execute(task: AgentTask): Promise<AgentResult>;
}

export interface AgentTask {
  taskId: string;
  projectId: string;
  type: string;
  role: AgentRole;
  priority: TaskPriority;
  payload: Record<string, unknown>;
  dependencies: string[];
  createdAt: Date;
  assignedTo?: string;
  status: TaskStatus;
}

export interface AgentResult {
  taskId: string;
  agentId: string;
  success: boolean;
  output: Record<string, unknown>;
  decisions: AgentDecision[];
  durationMs: number;
  timestamp: Date;
  error?: string;
}

export interface AgentDecision {
  decisionId: string;
  agentId: string;
  taskId: string;
  category: string;
  summary: string;
  reasoning: string;
  impact: string;
  confidence: number; // 0–1
  timestamp: Date;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  assignedAt: Date;
  reason: string;
}

export interface AgentExecutionPlan {
  planId: string;
  projectId: string;
  tasks: AgentTask[];
  executionOrder: string[]; // taskId order
  parallelGroups: string[][]; // groups of taskIds that can run in parallel
  createdAt: Date;
}

export interface Conflict {
  conflictId: string;
  agents: string[];
  field: string;
  values: Record<string, unknown>; // agentId → value
  detectedAt: Date;
  resolved: boolean;
  resolution?: unknown;
}

export interface AgentMemorySnapshot {
  agentId: string;
  snapshotId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface CollaborationGraph {
  nodes: CollaborationNode[];
  edges: CollaborationEdge[];
}

export interface CollaborationNode {
  id: string;
  type: "agent" | "task" | "decision" | "artifact";
  label: string;
  metadata?: Record<string, unknown>;
}

export interface CollaborationEdge {
  from: string;
  to: string;
  relationship:
    "produces" | "consumes" | "conflicts" | "depends_on" | "validates";
}
