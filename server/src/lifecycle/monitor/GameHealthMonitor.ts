/**
 * GameHealthMonitor.ts
 *
 * Monitors game health metrics over time.
 * Aggregates: engagement, economy stability, NPC diversity, anomaly rate.
 */

export interface HealthMetrics {
  gameId: string;
  engagementScore: number;
  economyStability: number;
  npcDiversity: number;
  anomalyRate: number;
  retentionSimulated: number;
  overall: number;
  trend: "improving" | "stable" | "declining";
  timestamp: Date;
}

export class GameHealthMonitor {
  private history = new Map<string, HealthMetrics[]>();

  /**
   * Record a health check for a game.
   */
  record(metrics: HealthMetrics): void {
    const existing = this.history.get(metrics.gameId) ?? [];
    existing.push(metrics);
    // Keep last 100 readings
    if (existing.length > 100) existing.shift();
    this.history.set(metrics.gameId, existing);
  }

  /**
   * Compute composite health from individual signals.
   */
  computeHealth(
    gameId: string,
    engagement: number,
    economyStability: number,
    npcDiversity: number,
    anomalyRate: number,
  ): HealthMetrics {
    const retentionSimulated = Math.round(
      engagement * 0.5 + economyStability * 0.3 + npcDiversity * 0.2,
    );
    const overall = Math.round(
      engagement * 0.3 +
        economyStability * 0.25 +
        npcDiversity * 0.15 +
        (100 - anomalyRate) * 0.15 +
        retentionSimulated * 0.15,
    );

    // Compute trend from history
    const prev = this.getLatest(gameId);
    let trend: HealthMetrics["trend"] = "stable";
    if (prev) {
      if (overall > prev.overall + 5) trend = "improving";
      else if (overall < prev.overall - 5) trend = "declining";
    }

    const metrics: HealthMetrics = {
      gameId,
      engagementScore: engagement,
      economyStability,
      npcDiversity,
      anomalyRate,
      retentionSimulated,
      overall,
      trend,
      timestamp: new Date(),
    };

    this.record(metrics);

    console.log(
      `[HEALTH] Game: ${gameId} | Overall: ${overall} | Trend: ${trend} | Engagement: ${engagement}`,
    );

    return metrics;
  }

  /**
   * Get latest health metrics for a game.
   */
  getLatest(gameId: string): HealthMetrics | null {
    const history = this.history.get(gameId);
    return history?.[history.length - 1] ?? null;
  }

  /**
   * Get full health history.
   */
  getHistory(gameId: string): ReadonlyArray<HealthMetrics> {
    return this.history.get(gameId) ?? [];
  }

  /**
   * Check if a game needs intervention (health declining).
   */
  needsIntervention(gameId: string): boolean {
    const latest = this.getLatest(gameId);
    return (
      latest !== null && (latest.overall < 50 || latest.trend === "declining")
    );
  }
}
