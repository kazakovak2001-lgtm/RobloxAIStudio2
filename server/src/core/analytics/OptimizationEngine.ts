/**
 * OptimizationEngine.ts
 *
 * Generates actionable optimization suggestions based on analytics data.
 * SAFE MODE: produces recommendations only — never modifies execution behavior.
 *
 * Suggestion types:
 *   - reorder-dag: reorder steps for better efficiency
 *   - replace-agent: suggest agent alternatives for weak performers
 *   - reduce-evaluation: skip redundant evaluations
 *   - optimize-memory: tune memory injection frequency
 *   - add-retry: increase retries for unreliable nodes
 *   - parallelize: identify parallelizable node groups
 */

import { randomUUID } from "crypto";
import type {
  AgentPerformanceSummary,
  FailurePattern,
  FeedbackSignal,
  OptimizationSuggestion,
  PipelineEfficiencyReport,
} from "./types";

export class OptimizationEngine {
  private suggestions: OptimizationSuggestion[] = [];

  /**
   * Analyze all available data and generate optimization suggestions.
   */
  analyze(params: {
    agentSummaries: AgentPerformanceSummary[];
    patterns: FailurePattern[];
    signals: FeedbackSignal[];
    efficiencyReports: PipelineEfficiencyReport[];
  }): OptimizationSuggestion[] {
    this.suggestions = [];

    this.suggestRetries(params.agentSummaries, params.patterns);
    this.suggestAgentReplacements(params.agentSummaries);
    this.suggestDagReordering(params.efficiencyReports);
    this.suggestMemoryOptimization(params.signals);
    this.suggestParallelization(params.efficiencyReports);
    this.suggestEvaluationReduction(params.agentSummaries);

    return this.suggestions;
  }

  /**
   * Get all current suggestions.
   */
  getSuggestions(): OptimizationSuggestion[] {
    return [...this.suggestions];
  }

  /**
   * Get suggestions by priority.
   */
  getSuggestionsByPriority(
    priority: OptimizationSuggestion["priority"],
  ): OptimizationSuggestion[] {
    return this.suggestions.filter((s) => s.priority === priority);
  }

  // ─── Suggestion Generators ────────────────────────────────────────────

  private suggestRetries(
    summaries: AgentPerformanceSummary[],
    patterns: FailurePattern[],
  ): void {
    // Agents with failure rate > 20% that have repeated-failure patterns
    const unreliable = summaries.filter(
      (s) => s.successRate < 0.8 && s.failureCount >= 2,
    );
    const failedAgents = new Set(
      patterns.filter((p) => p.type === "repeated-failure").map((p) => p.agent),
    );

    for (const agent of unreliable) {
      if (failedAgents.has(agent.agent)) {
        this.suggestions.push({
          id: `opt-${randomUUID().slice(0, 8)}`,
          type: "add-retry",
          priority: agent.successRate < 0.5 ? "high" : "medium",
          description: `Increase retry count for "${agent.agent}" — current success rate: ${Math.round(agent.successRate * 100)}%`,
          expectedImprovement: `+${Math.round((1 - agent.successRate) * 30)}% success rate with additional retries`,
          affectedNodes: [agent.agent],
          confidence: 0.7,
        });
      }
    }
  }

  private suggestAgentReplacements(summaries: AgentPerformanceSummary[]): void {
    // Agents with consistently low scores and degrading trend
    const weak = summaries.filter(
      (s) =>
        s.averageScore < 40 &&
        s.totalExecutions >= 3 &&
        s.trend === "degrading",
    );

    for (const agent of weak) {
      this.suggestions.push({
        id: `opt-${randomUUID().slice(0, 8)}`,
        type: "replace-agent",
        priority: agent.averageScore < 25 ? "high" : "medium",
        description: `Agent "${agent.agent}" is underperforming (avg score: ${Math.round(agent.averageScore)}, trend: degrading). Consider replacement or prompt tuning.`,
        expectedImprovement: `+${Math.round(50 - agent.averageScore)} quality score improvement potential`,
        affectedNodes: [agent.agent],
        confidence: 0.6,
      });
    }
  }

  private suggestDagReordering(reports: PipelineEfficiencyReport[]): void {
    // If the slowest node is early in the pipeline, suggest moving it later
    // or adding parallelization
    for (const report of reports) {
      if (report.slowestNode && report.efficiencyScore < 60) {
        this.suggestions.push({
          id: `opt-${randomUUID().slice(0, 8)}`,
          type: "reorder-dag",
          priority: "low",
          description: `Execution ${report.executionId} bottleneck: "${report.slowestNode.agent}" took ${report.slowestNode.durationMs}ms. Consider reordering or parallelizing.`,
          expectedImprovement: `Potential -${Math.round(report.slowestNode.durationMs * 0.3)}ms total execution time`,
          affectedNodes: [report.slowestNode.nodeId],
          confidence: 0.4,
        });
      }
    }
  }

  private suggestMemoryOptimization(signals: FeedbackSignal[]): void {
    const memorySignals = signals.filter((s) => s.type === "memory-usefulness");
    if (memorySignals.length < 3) return;

    const avgValue =
      memorySignals.reduce((sum, s) => sum + s.value, 0) / memorySignals.length;

    if (avgValue < 40) {
      // Memory injection isn't helping
      this.suggestions.push({
        id: `opt-${randomUUID().slice(0, 8)}`,
        type: "optimize-memory",
        priority: "medium",
        description: `Memory injection has low usefulness (avg signal: ${Math.round(avgValue)}/100). Consider reducing injection frequency or improving memory content.`,
        expectedImprovement: `Reduced latency from fewer memory lookups; focus on higher-quality memory entries`,
        affectedNodes: memorySignals.map((s) => s.source),
        confidence: 0.5,
      });
    } else if (avgValue > 80) {
      // Memory is very useful — suggest more frequent injection
      this.suggestions.push({
        id: `opt-${randomUUID().slice(0, 8)}`,
        type: "optimize-memory",
        priority: "low",
        description: `Memory injection is highly effective (avg signal: ${Math.round(avgValue)}/100). Consider expanding injection to more nodes.`,
        expectedImprovement: `+5-10% quality scores from expanded memory context`,
        affectedNodes: memorySignals.map((s) => s.source),
        confidence: 0.5,
      });
    }
  }

  private suggestParallelization(reports: PipelineEfficiencyReport[]): void {
    // Executions with many nodes but sequential execution
    for (const report of reports) {
      if (report.totalNodes >= 5 && report.totalDurationMs > 15000) {
        this.suggestions.push({
          id: `opt-${randomUUID().slice(0, 8)}`,
          type: "parallelize",
          priority: "low",
          description: `Execution ${report.executionId} ran ${report.totalNodes} nodes sequentially in ${report.totalDurationMs}ms. Independent nodes could run in parallel.`,
          expectedImprovement: `Potential -${Math.round(report.totalDurationMs * 0.4)}ms with parallel execution of independent branches`,
          affectedNodes: [],
          confidence: 0.3,
        });
      }
    }
  }

  private suggestEvaluationReduction(
    summaries: AgentPerformanceSummary[],
  ): void {
    // Agents with very high consistent scores don't need heavy evaluation
    const highPerformers = summaries.filter(
      (s) =>
        s.averageScore > 85 &&
        s.totalExecutions >= 5 &&
        s.trend !== "degrading",
    );

    if (highPerformers.length >= 2) {
      this.suggestions.push({
        id: `opt-${randomUUID().slice(0, 8)}`,
        type: "reduce-evaluation",
        priority: "low",
        description: `${highPerformers.length} agents consistently score >85. Consider lightweight evaluation for these stable performers.`,
        expectedImprovement: `Reduced evaluation overhead for trusted agents`,
        affectedNodes: highPerformers.map((a) => a.agent),
        confidence: 0.5,
      });
    }
  }
}
