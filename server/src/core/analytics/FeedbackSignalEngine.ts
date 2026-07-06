/**
 * FeedbackSignalEngine.ts
 *
 * Generates feedback signals from analytics data.
 * Signals are normalized scores (0-100) that can be stored in the memory system
 * and used by future PlanExecutor runs to improve agent selection and execution.
 *
 * Signal types:
 *   - agent-performance: how well an agent performed historically
 *   - node-reliability: how reliable a DAG node is (success rate)
 *   - pipeline-efficiency: overall pipeline health
 *   - memory-usefulness: whether injected memory improved outcomes
 */

import { randomUUID } from "crypto";
import type {
  FeedbackSignal,
  AgentPerformanceSummary,
  PipelineEfficiencyReport,
} from "./types";

export class FeedbackSignalEngine {
  private signals: FeedbackSignal[] = [];
  private maxSignals = 2000;

  /**
   * Generate agent performance signal from summary data.
   */
  generateAgentSignal(summary: AgentPerformanceSummary): FeedbackSignal {
    // Combine success rate and average score into one signal
    const value = Math.round(
      summary.successRate * 50 + summary.averageScore * 0.5,
    );
    const signal: FeedbackSignal = {
      signalId: `sig-${randomUUID().slice(0, 8)}`,
      type: "agent-performance",
      source: summary.agent,
      value: Math.min(100, Math.max(0, value)),
      timestamp: Date.now(),
      metadata: {
        totalExecutions: summary.totalExecutions,
        successRate: summary.successRate,
        averageScore: summary.averageScore,
        trend: summary.trend,
        failureCount: summary.failureCount,
      },
    };

    this.store(signal);
    return signal;
  }

  /**
   * Generate node reliability signal.
   */
  generateNodeReliabilitySignal(
    nodeId: string,
    agent: string,
    successCount: number,
    totalCount: number,
    averageDurationMs: number,
  ): FeedbackSignal {
    const reliability = totalCount > 0 ? (successCount / totalCount) * 100 : 50;
    // Penalize very slow nodes
    const speedPenalty =
      averageDurationMs > 10000 ? 10 : averageDurationMs > 5000 ? 5 : 0;
    const value = Math.max(0, Math.round(reliability - speedPenalty));

    const signal: FeedbackSignal = {
      signalId: `sig-${randomUUID().slice(0, 8)}`,
      type: "node-reliability",
      source: `${agent}:${nodeId}`,
      value,
      timestamp: Date.now(),
      metadata: { nodeId, agent, successCount, totalCount, averageDurationMs },
    };

    this.store(signal);
    return signal;
  }

  /**
   * Generate pipeline efficiency signal from report.
   */
  generatePipelineSignal(report: PipelineEfficiencyReport): FeedbackSignal {
    const signal: FeedbackSignal = {
      signalId: `sig-${randomUUID().slice(0, 8)}`,
      type: "pipeline-efficiency",
      source: report.executionId,
      value: report.efficiencyScore,
      timestamp: Date.now(),
      metadata: {
        totalNodes: report.totalNodes,
        completedNodes: report.completedNodes,
        failedNodes: report.failedNodes,
        totalDurationMs: report.totalDurationMs,
        slowestNode: report.slowestNode,
        lowestScoreNode: report.lowestScoreNode,
      },
    };

    this.store(signal);
    return signal;
  }

  /**
   * Generate memory usefulness signal.
   * Compares agent scores with vs without memory injection.
   */
  generateMemorySignal(
    agent: string,
    scoreWithMemory: number,
    scoreWithoutMemory: number,
  ): FeedbackSignal {
    const improvement = scoreWithMemory - scoreWithoutMemory;
    // Normalize: -50 to +50 range mapped to 0-100
    const value = Math.min(100, Math.max(0, Math.round(50 + improvement)));

    const signal: FeedbackSignal = {
      signalId: `sig-${randomUUID().slice(0, 8)}`,
      type: "memory-usefulness",
      source: agent,
      value,
      timestamp: Date.now(),
      metadata: { scoreWithMemory, scoreWithoutMemory, improvement },
    };

    this.store(signal);
    return signal;
  }

  // ─── Query ─────────────────────────────────────────────────────────────

  /**
   * Get all signals for a specific source (agent/node).
   */
  getSignalsForSource(source: string): FeedbackSignal[] {
    return this.signals.filter((s) => s.source === source);
  }

  /**
   * Get all signals of a specific type.
   */
  getSignalsByType(type: FeedbackSignal["type"]): FeedbackSignal[] {
    return this.signals.filter((s) => s.type === type);
  }

  /**
   * Get the latest signal for a source.
   */
  getLatestSignal(source: string): FeedbackSignal | null {
    const sourceSignals = this.getSignalsForSource(source);
    return sourceSignals.length > 0
      ? sourceSignals[sourceSignals.length - 1]
      : null;
  }

  /**
   * Get average signal value for a source over time.
   */
  getAverageSignalValue(source: string): number {
    const sourceSignals = this.getSignalsForSource(source);
    if (sourceSignals.length === 0) return 50; // neutral default
    return (
      sourceSignals.reduce((sum, s) => sum + s.value, 0) / sourceSignals.length
    );
  }

  /**
   * Get all stored signals.
   */
  getAllSignals(): FeedbackSignal[] {
    return [...this.signals];
  }

  get signalCount(): number {
    return this.signals.length;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private store(signal: FeedbackSignal): void {
    this.signals.push(signal);
    if (this.signals.length > this.maxSignals) {
      this.signals.shift();
    }
  }
}
