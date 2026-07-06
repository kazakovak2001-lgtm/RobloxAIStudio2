/**
 * EvaluationAggregator.ts
 *
 * Aggregates evaluation scores over time.
 * Computes per-agent averages, drift detection, and regression alerts.
 */

import type { EvaluationResult } from "../core/EvaluationEngine";

export interface AgentScoreSummary {
  agentType: string;
  totalEvaluations: number;
  averageQuality: number;
  averageCoherence: number;
  averageCompleteness: number;
  averageCorrectness: number;
  averageRisk: number;
  trend: "improving" | "stable" | "degrading";
  lastScore: number;
  passRate: number;
}

export interface DriftAlert {
  agentType: string;
  metric: string;
  previousAvg: number;
  currentAvg: number;
  delta: number;
  severity: "low" | "medium" | "high";
  detectedAt: Date;
}

export class EvaluationAggregator {
  private results: EvaluationResult[] = [];
  private alerts: DriftAlert[] = [];

  /**
   * Add evaluation results for aggregation.
   */
  addResults(results: EvaluationResult[]): void {
    this.results.push(...results);
    this.detectDrift();
  }

  addResult(result: EvaluationResult): void {
    this.results.push(result);
  }

  /**
   * Get per-agent score summary.
   */
  getSummary(agentType: string): AgentScoreSummary | null {
    const agentResults = this.results.filter((r) => r.agentType === agentType);
    if (agentResults.length === 0) return null;

    const avg = (arr: number[]) =>
      arr.length > 0
        ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
        : 0;

    const qualities = agentResults.map((r) => r.score.quality);
    const recentQualities = qualities.slice(-5);
    const olderQualities = qualities.slice(0, -5);

    let trend: AgentScoreSummary["trend"] = "stable";
    if (olderQualities.length >= 3 && recentQualities.length >= 3) {
      const oldAvg = avg(olderQualities);
      const newAvg = avg(recentQualities);
      if (newAvg > oldAvg + 5) trend = "improving";
      else if (newAvg < oldAvg - 5) trend = "degrading";
    }

    return {
      agentType,
      totalEvaluations: agentResults.length,
      averageQuality: avg(agentResults.map((r) => r.score.quality)),
      averageCoherence: avg(agentResults.map((r) => r.score.coherence)),
      averageCompleteness: avg(agentResults.map((r) => r.score.completeness)),
      averageCorrectness: avg(agentResults.map((r) => r.score.correctness)),
      averageRisk: avg(agentResults.map((r) => r.score.risk)),
      trend,
      lastScore: qualities[qualities.length - 1] ?? 0,
      passRate:
        agentResults.filter((r) => r.passed).length / agentResults.length,
    };
  }

  /**
   * Get all agent summaries.
   */
  getAllSummaries(): AgentScoreSummary[] {
    const agentTypes = [...new Set(this.results.map((r) => r.agentType))];
    return agentTypes.map((t) => this.getSummary(t)!).filter(Boolean);
  }

  /**
   * Get drift alerts.
   */
  getAlerts(): ReadonlyArray<DriftAlert> {
    return this.alerts;
  }

  private detectDrift(): void {
    const agentTypes = [...new Set(this.results.map((r) => r.agentType))];

    for (const agentType of agentTypes) {
      const agentResults = this.results.filter(
        (r) => r.agentType === agentType,
      );
      if (agentResults.length < 6) continue;

      const recent = agentResults.slice(-3).map((r) => r.score.quality);
      const older = agentResults.slice(-6, -3).map((r) => r.score.quality);

      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
      const delta = recentAvg - olderAvg;

      if (delta < -15) {
        this.alerts.push({
          agentType,
          metric: "quality",
          previousAvg: Math.round(olderAvg),
          currentAvg: Math.round(recentAvg),
          delta: Math.round(delta),
          severity: delta < -25 ? "high" : "medium",
          detectedAt: new Date(),
        });
      }
    }
  }
}
