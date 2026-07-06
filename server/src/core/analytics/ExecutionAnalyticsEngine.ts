/**
 * ExecutionAnalyticsEngine.ts
 *
 * Analyzes ExecutionTrace data to extract performance metrics,
 * detect anomalies, and score pipeline efficiency.
 *
 * Inputs: TraceStore (observability layer)
 * Outputs: AgentPerformanceRecords, PipelineEfficiencyReports
 */

import { TraceStore } from "../observability/TraceStore";
import type {
  ExecutionTrace,
  ExecutionTraceEvent,
} from "../observability/types";
import type {
  AgentPerformanceRecord,
  AgentPerformanceSummary,
  PipelineEfficiencyReport,
} from "./types";

export class ExecutionAnalyticsEngine {
  private store: TraceStore;
  private records: AgentPerformanceRecord[] = [];
  private maxRecords = 5000;

  constructor(store?: TraceStore) {
    this.store = store ?? TraceStore.instance();
  }

  /**
   * Ingest all available traces and extract performance records.
   */
  ingest(): number {
    const traces = this.store.listTraces();
    let ingested = 0;

    for (const trace of traces) {
      const newRecords = this.extractRecords(trace);
      for (const rec of newRecords) {
        if (
          !this.records.some(
            (r) => r.executionId === rec.executionId && r.nodeId === rec.nodeId,
          )
        ) {
          this.records.push(rec);
          ingested++;
        }
      }
    }

    // Trim to max
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    return ingested;
  }

  /**
   * Add a single performance record directly.
   */
  addRecord(record: AgentPerformanceRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }

  /**
   * Get performance summary for a specific agent.
   */
  getAgentSummary(agent: string): AgentPerformanceSummary | null {
    const agentRecords = this.records.filter((r) => r.agent === agent);
    if (agentRecords.length === 0) return null;

    const scores = agentRecords.map((r) => r.evaluationScore);
    const durations = agentRecords.map((r) => r.durationMs);
    const successCount = agentRecords.filter(
      (r) => r.passed && !r.failed,
    ).length;
    const failureCount = agentRecords.filter((r) => r.failed).length;

    // Trend: compare last 5 vs first 5
    const trend = this.computeTrend(scores);

    return {
      agent,
      totalExecutions: agentRecords.length,
      successRate: successCount / agentRecords.length,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      averageDurationMs:
        durations.reduce((a, b) => a + b, 0) / durations.length,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      failureCount,
      trend,
    };
  }

  /**
   * Get summaries for all known agents.
   */
  getAllAgentSummaries(): AgentPerformanceSummary[] {
    const agents = [...new Set(this.records.map((r) => r.agent))];
    return agents
      .map((a) => this.getAgentSummary(a))
      .filter((s): s is AgentPerformanceSummary => s !== null)
      .sort((a, b) => b.averageScore - a.averageScore);
  }

  /**
   * Analyze a specific execution trace for efficiency.
   */
  analyzeExecution(executionId: string): PipelineEfficiencyReport | null {
    const trace = this.store.getTrace(executionId);
    if (!trace) return null;
    return this.buildEfficiencyReport(trace);
  }

  /**
   * Get efficiency reports for all completed traces.
   */
  getAllEfficiencyReports(): PipelineEfficiencyReport[] {
    const traces = this.store
      .listTraces()
      .filter((t) => t.status === "completed" || t.status === "failed");
    return traces.map((t) => this.buildEfficiencyReport(t));
  }

  /**
   * Get the top N slowest agents across all executions.
   */
  getSlowestAgents(
    n = 5,
  ): Array<{ agent: string; averageDurationMs: number; count: number }> {
    const agentDurations = new Map<string, number[]>();
    for (const rec of this.records) {
      if (!agentDurations.has(rec.agent)) agentDurations.set(rec.agent, []);
      agentDurations.get(rec.agent)!.push(rec.durationMs);
    }

    return [...agentDurations.entries()]
      .map(([agent, durations]) => ({
        agent,
        averageDurationMs:
          durations.reduce((a, b) => a + b, 0) / durations.length,
        count: durations.length,
      }))
      .sort((a, b) => b.averageDurationMs - a.averageDurationMs)
      .slice(0, n);
  }

  /**
   * Get the top N lowest-scoring agents.
   */
  getLowestScoringAgents(
    n = 5,
  ): Array<{ agent: string; averageScore: number; count: number }> {
    const agentScores = new Map<string, number[]>();
    for (const rec of this.records) {
      if (!agentScores.has(rec.agent)) agentScores.set(rec.agent, []);
      agentScores.get(rec.agent)!.push(rec.evaluationScore);
    }

    return [...agentScores.entries()]
      .map(([agent, scores]) => ({
        agent,
        averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        count: scores.length,
      }))
      .sort((a, b) => a.averageScore - b.averageScore)
      .slice(0, n);
  }

  get recordCount(): number {
    return this.records.length;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private extractRecords(trace: ExecutionTrace): AgentPerformanceRecord[] {
    const records: AgentPerformanceRecord[] = [];
    const completions = trace.events.filter(
      (e) => e.eventType === "node.completed" || e.eventType === "node.failed",
    );

    for (const event of completions) {
      records.push({
        agent: event.agentId,
        executionId: trace.executionId,
        nodeId: event.nodeId,
        durationMs: event.durationMs ?? 0,
        evaluationScore: event.evaluationScore ?? 0,
        passed:
          event.eventType === "node.completed" &&
          (event.evaluationPassed ?? true),
        failed: event.eventType === "node.failed",
        timestamp: event.timestamp,
      });
    }

    return records;
  }

  private buildEfficiencyReport(
    trace: ExecutionTrace,
  ): PipelineEfficiencyReport {
    const completions = trace.events.filter(
      (e) => e.eventType === "node.completed" || e.eventType === "node.failed",
    );

    const durations = completions
      .filter((e) => e.durationMs)
      .map((e) => e.durationMs!);
    const scores = completions
      .filter((e) => e.evaluationScore !== undefined)
      .map((e) => e.evaluationScore!);
    const completedCount = completions.filter(
      (e) => e.eventType === "node.completed",
    ).length;
    const failedCount = completions.filter(
      (e) => e.eventType === "node.failed",
    ).length;

    const slowest = this.findExtreme(
      completions,
      (a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0),
    );
    const lowestScore = this.findExtreme(
      completions.filter((e) => e.evaluationScore !== undefined),
      (a, b) => (a.evaluationScore ?? 100) - (b.evaluationScore ?? 100),
    );

    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
    const avgScore =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const successRatio =
      completions.length > 0 ? completedCount / completions.length : 0;

    // Efficiency = weighted average: 40% score, 30% success rate, 30% time efficiency
    const timeEfficiency =
      avgDuration > 0 ? Math.min(100, (5000 / avgDuration) * 50) : 50;
    const efficiencyScore = Math.round(
      avgScore * 0.4 + successRatio * 100 * 0.3 + timeEfficiency * 0.3,
    );

    return {
      executionId: trace.executionId,
      totalNodes: trace.nodeCount,
      completedNodes: completedCount,
      failedNodes: failedCount,
      totalDurationMs: trace.totalDurationMs ?? 0,
      averageNodeDurationMs: Math.round(avgDuration),
      slowestNode: slowest
        ? {
            nodeId: slowest.nodeId,
            agent: slowest.agentId,
            durationMs: slowest.durationMs ?? 0,
          }
        : null,
      lowestScoreNode: lowestScore
        ? {
            nodeId: lowestScore.nodeId,
            agent: lowestScore.agentId,
            score: lowestScore.evaluationScore ?? 0,
          }
        : null,
      efficiencyScore: Math.min(100, Math.max(0, efficiencyScore)),
    };
  }

  private findExtreme(
    events: ExecutionTraceEvent[],
    comparator: (a: ExecutionTraceEvent, b: ExecutionTraceEvent) => number,
  ): ExecutionTraceEvent | null {
    if (events.length === 0) return null;
    return events.slice().sort(comparator)[0];
  }

  private computeTrend(scores: number[]): "improving" | "degrading" | "stable" {
    if (scores.length < 4) return "stable";
    const half = Math.floor(scores.length / 2);
    const firstHalf = scores.slice(0, half);
    const secondHalf = scores.slice(half);
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const delta = avgSecond - avgFirst;
    if (delta > 5) return "improving";
    if (delta < -5) return "degrading";
    return "stable";
  }
}
