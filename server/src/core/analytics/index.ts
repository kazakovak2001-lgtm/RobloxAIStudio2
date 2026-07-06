/**
 * Analytics module — public API
 */

export { ExecutionAnalyticsEngine } from "./ExecutionAnalyticsEngine";
export { FeedbackSignalEngine } from "./FeedbackSignalEngine";
export { PatternDetector } from "./PatternDetector";
export { OptimizationEngine } from "./OptimizationEngine";
export {
  FeedbackLoopPipeline,
  type FeedbackCycleResult,
} from "./FeedbackLoopPipeline";
export type {
  AgentPerformanceRecord,
  AgentPerformanceSummary,
  PipelineEfficiencyReport,
  FailurePattern,
  FeedbackSignal,
  OptimizationSuggestion,
  SystemHealthReport,
} from "./types";
