/**
 * Observability types — shared across all execution tracing components.
 */

export interface ExecutionTraceEvent {
  executionId: string;
  /**
   * SEC-REALTIME-TRACE-001. The project this execution belongs to, so a trace
   * consumer can be restricted to the tenant entitled to it. Optional because
   * an execution started without a project genuinely has none; consumers must
   * treat its absence as "do not deliver" rather than "deliver to everyone".
   */
  projectId?: string;
  nodeId: string;
  agentId: string;
  eventType:
    | "node.started"
    | "node.completed"
    | "node.failed"
    | "memory.injected"
    | "evaluation.scored"
    | "plan.started"
    | "plan.completed"
    | "plan.failed";
  timestamp: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  memoryDelta?: unknown;
  evaluationScore?: number;
  evaluationPassed?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionTrace {
  executionId: string;
  /** Project this execution belongs to, when it was started with one. */
  projectId?: string;
  planId: string;
  goal: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "failed";
  totalDurationMs?: number;
  events: ExecutionTraceEvent[];
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  outputs?: Record<string, unknown>;
}

export interface ExecutionGraphNode {
  id: string;
  agent: string;
  status: "pending" | "running" | "done" | "failed";
  durationMs?: number;
  evaluationScore?: number;
  dependencies: string[];
}

export interface ExecutionGraphEdge {
  from: string;
  to: string;
}

export interface ExecutionGraph {
  executionId: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}

export interface ReplayStep {
  index: number;
  nodeId: string;
  agent: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  evaluationScore?: number;
}

export interface ReplayResult {
  executionId: string;
  originalDurationMs: number;
  replayDurationMs: number;
  steps: ReplayStep[];
  divergences: Array<{
    nodeId: string;
    field: string;
    original: unknown;
    replayed: unknown;
  }>;
}
