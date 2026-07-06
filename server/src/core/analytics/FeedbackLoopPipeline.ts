/**
 * FeedbackLoopPipeline.ts
 *
 * Orchestrates the complete feedback loop:
 *   ExecutionTrace → AnalyticsEngine → PatternDetector → FeedbackSignalEngine
 *                                                        → OptimizationEngine
 *                                                        → MemoryEngine (learning storage)
 *
 * This is the top-level entry point for the analytics system.
 * Call `runCycle()` periodically or after execution completion.
 */

import { ExecutionAnalyticsEngine } from "./ExecutionAnalyticsEngine";
import { FeedbackSignalEngine } from "./FeedbackSignalEngine";
import { PatternDetector } from "./PatternDetector";
import { OptimizationEngine } from "./OptimizationEngine";
import type {
  SystemHealthReport,
  FeedbackSignal,
  FailurePattern,
  OptimizationSuggestion,
  AgentPerformanceSummary,
} from "./types";

export interface FeedbackCycleResult {
  ingested: number;
  agentSummaries: AgentPerformanceSummary[];
  patterns: FailurePattern[];
  signals: FeedbackSignal[];
  suggestions: OptimizationSuggestion[];
  systemHealth: SystemHealthReport;
}

export class FeedbackLoopPipeline {
  private analytics: ExecutionAnalyticsEngine;
  private feedbackEngine: FeedbackSignalEngine;
  private patternDetector: PatternDetector;
  private optimizationEngine: OptimizationEngine;
  private cycleCount = 0;
  private lastCycleAt = 0;

  constructor(analytics?: ExecutionAnalyticsEngine) {
    this.analytics = analytics ?? new ExecutionAnalyticsEngine();
    this.feedbackEngine = new FeedbackSignalEngine();
    this.patternDetector = new PatternDetector();
    this.optimizationEngine = new OptimizationEngine();
  }

  /**
   * Run a complete feedback cycle.
   * Ingests traces → analyzes → detects patterns → generates signals → suggests optimizations.
   */
  runCycle(): FeedbackCycleResult {
    this.cycleCount++;
    this.lastCycleAt = Date.now();

    // Step 1: Ingest traces into analytics
    const ingested = this.analytics.ingest();

    // Step 2: Get agent summaries
    const agentSummaries = this.analytics.getAllAgentSummaries();

    // Step 3: Detect patterns
    const allRecords = agentSummaries.flatMap((summary) => {
      // Reconstruct minimal records from summaries for pattern detection
      const records = [];
      for (let i = 0; i < summary.totalExecutions; i++) {
        records.push({
          agent: summary.agent,
          executionId: `exec-${i}`,
          nodeId: `node-${summary.agent}-${i}`,
          durationMs: summary.averageDurationMs,
          evaluationScore: summary.averageScore,
          passed: i < summary.totalExecutions - summary.failureCount,
          failed: i >= summary.totalExecutions - summary.failureCount,
          timestamp: Date.now() - (summary.totalExecutions - i) * 60000,
        });
      }
      return records;
    });
    const patterns = this.patternDetector.detect(allRecords);

    // Step 4: Generate feedback signals for each agent
    const signals: FeedbackSignal[] = [];
    for (const summary of agentSummaries) {
      signals.push(this.feedbackEngine.generateAgentSignal(summary));
    }

    // Step 5: Generate pipeline signals from efficiency reports
    const efficiencyReports = this.analytics.getAllEfficiencyReports();
    for (const report of efficiencyReports.slice(0, 10)) {
      signals.push(this.feedbackEngine.generatePipelineSignal(report));
    }

    // Step 6: Generate optimization suggestions
    const suggestions = this.optimizationEngine.analyze({
      agentSummaries,
      patterns,
      signals: this.feedbackEngine.getAllSignals(),
      efficiencyReports,
    });

    // Step 7: Compute system health
    const systemHealth = this.computeSystemHealth(
      agentSummaries,
      patterns,
      signals,
      suggestions,
    );

    return {
      ingested,
      agentSummaries,
      patterns,
      signals,
      suggestions,
      systemHealth,
    };
  }

  /**
   * Get the current system health without running a full cycle.
   */
  getSystemHealth(): SystemHealthReport {
    const summaries = this.analytics.getAllAgentSummaries();
    const patterns = this.patternDetector.getPatterns();
    const signals = this.feedbackEngine.getAllSignals();
    const suggestions = this.optimizationEngine.getSuggestions();
    return this.computeSystemHealth(summaries, patterns, signals, suggestions);
  }

  /**
   * Get component references for direct access.
   */
  getAnalytics(): ExecutionAnalyticsEngine {
    return this.analytics;
  }

  getFeedbackEngine(): FeedbackSignalEngine {
    return this.feedbackEngine;
  }

  getPatternDetector(): PatternDetector {
    return this.patternDetector;
  }

  getOptimizationEngine(): OptimizationEngine {
    return this.optimizationEngine;
  }

  getCycleCount(): number {
    return this.cycleCount;
  }

  getLastCycleAt(): number {
    return this.lastCycleAt;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private computeSystemHealth(
    summaries: AgentPerformanceSummary[],
    patterns: FailurePattern[],
    signals: FeedbackSignal[],
    suggestions: OptimizationSuggestion[],
  ): SystemHealthReport {
    // Agent health: average of all agent scores
    const agentHealth =
      summaries.length > 0
        ? summaries.reduce((sum, s) => sum + s.averageScore, 0) /
          summaries.length
        : 50;

    // Pipeline health: from pipeline signals
    const pipelineSignals = signals.filter(
      (s) => s.type === "pipeline-efficiency",
    );
    const pipelineHealth =
      pipelineSignals.length > 0
        ? pipelineSignals.reduce((sum, s) => sum + s.value, 0) /
          pipelineSignals.length
        : 50;

    // Memory health: from memory signals
    const memorySignals = signals.filter((s) => s.type === "memory-usefulness");
    const memoryHealth =
      memorySignals.length > 0
        ? memorySignals.reduce((sum, s) => sum + s.value, 0) /
          memorySignals.length
        : 50;

    // Failure rate
    const totalExecutions = summaries.reduce(
      (sum, s) => sum + s.totalExecutions,
      0,
    );
    const totalFailures = summaries.reduce((sum, s) => sum + s.failureCount, 0);
    const failureRate =
      totalExecutions > 0 ? totalFailures / totalExecutions : 0;

    // Overall score: weighted
    const overallScore = Math.round(
      agentHealth * 0.35 +
        pipelineHealth * 0.3 +
        memoryHealth * 0.15 +
        (1 - failureRate) * 100 * 0.2,
    );

    return {
      overallScore: Math.min(100, Math.max(0, overallScore)),
      agentHealth: Math.round(agentHealth),
      pipelineHealth: Math.round(pipelineHealth),
      memoryHealth: Math.round(memoryHealth),
      failureRate: Math.round(failureRate * 100) / 100,
      averageExecutionScore: Math.round(agentHealth),
      activePatterns: patterns.length,
      suggestions: suggestions.length,
      timestamp: Date.now(),
    };
  }
}
