/**
 * Agent Autonomy types — shared across the adaptive agent selection system.
 */

export interface AgentScore {
  agent: string;
  successRate: number; // 0-1
  avgQuality: number; // 0-100
  speedScore: number; // 0-100 (higher = faster)
  reliabilityIndex: number; // 0-100
  contextFitScore: number; // 0-100
  compositeScore: number; // 0-100 (weighted final)
  executionCount: number;
  lastUpdated: number;
}

export interface AgentSelectionResult {
  selectedAgent: string;
  score: AgentScore;
  alternates: Array<{ agent: string; score: number; reason: string }>;
  selectionReason: string;
  policyMode: SelectionPolicyMode;
}

export interface AgentFallbackResult {
  originalAgent: string;
  fallbackAgent: string;
  switchReason: string;
  switchCount: number;
  maxSwitches: number;
}

export type SelectionPolicyMode = "strict" | "balanced" | "experimental";

export interface SelectionPolicyConfig {
  mode: SelectionPolicyMode;
  weights: {
    successRate: number;
    quality: number;
    speed: number;
    reliability: number;
    contextFit: number;
  };
  thresholds: {
    minSuccessRate: number; // below this = not eligible
    minQuality: number; // below this = low priority
    maxSwitchesPerNode: number;
  };
}

export interface AgentExecutionRecord {
  agent: string;
  taskType: string;
  executionId: string;
  nodeId: string;
  success: boolean;
  quality: number;
  durationMs: number;
  contextKeys: string[];
  timestamp: number;
}

export interface TaskTypePerformance {
  taskType: string;
  agent: string;
  executionCount: number;
  successRate: number;
  avgQuality: number;
  avgDurationMs: number;
}
