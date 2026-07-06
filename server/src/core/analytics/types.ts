/**
 * Analytics types — shared across the feedback loop system.
 */

export interface AgentPerformanceRecord {
  agent: string;
  executionId: string;
  nodeId: string;
  durationMs: number;
  evaluationScore: number;
  passed: boolean;
  failed: boolean;
  timestamp: number;
}

export interface AgentPerformanceSummary {
  agent: string;
  totalExecutions: number;
  successRate: number;
  averageScore: number;
  averageDurationMs: number;
  minScore: number;
  maxScore: number;
  failureCount: number;
  trend: "improving" | "degrading" | "stable";
}

export interface PipelineEfficiencyReport {
  executionId: string;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  totalDurationMs: number;
  averageNodeDurationMs: number;
  slowestNode: { nodeId: string; agent: string; durationMs: number } | null;
  lowestScoreNode: { nodeId: string; agent: string; score: number } | null;
  efficiencyScore: number; // 0-100
}

export interface FailurePattern {
  patternId: string;
  type:
    | "repeated-failure"
    | "cascade-failure"
    | "timeout"
    | "low-score"
    | "inconsistent-output";
  agent: string;
  frequency: number;
  lastOccurrence: number;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface FeedbackSignal {
  signalId: string;
  type:
    | "agent-performance"
    | "node-reliability"
    | "pipeline-efficiency"
    | "memory-usefulness";
  source: string;
  value: number; // 0-100
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface OptimizationSuggestion {
  id: string;
  type:
    | "reorder-dag"
    | "replace-agent"
    | "reduce-evaluation"
    | "optimize-memory"
    | "add-retry"
    | "parallelize";
  priority: "low" | "medium" | "high";
  description: string;
  expectedImprovement: string;
  affectedNodes: string[];
  confidence: number; // 0-1
}

export interface SystemHealthReport {
  overallScore: number; // 0-100
  agentHealth: number;
  pipelineHealth: number;
  memoryHealth: number;
  failureRate: number;
  averageExecutionScore: number;
  activePatterns: number;
  suggestions: number;
  timestamp: number;
}
