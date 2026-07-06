/**
 * Agent Autonomy module — public API
 */

export { AgentDecisionEngine } from "./AgentDecisionEngine";
export { AgentPerformanceMemory } from "./AgentPerformanceMemory";
export { AgentSelectionPolicy } from "./AgentSelectionPolicy";
export type {
  AgentScore,
  AgentSelectionResult,
  AgentFallbackResult,
  SelectionPolicyMode,
  SelectionPolicyConfig,
  AgentExecutionRecord,
  TaskTypePerformance,
} from "./types";
