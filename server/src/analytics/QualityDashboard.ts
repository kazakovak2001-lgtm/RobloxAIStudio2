/**
 * QualityDashboard — Production monitoring for generation quality and reliability.
 */

export interface GenerationMetric {
  projectId: string;
  success: boolean;
  qualityScore: number;
  repairIterations: number;
  durationMs: number;
  timestamp: number;
  engineVersion: string;
  genre: string;
}

export interface DashboardStats {
  totalGenerations: number;
  successRate: number;
  averageScore: number;
  averageDuration: number;
  averageRepairs: number;
  failedCount: number;
  recentErrors: string[];
}

export class QualityDashboard {
  private metrics: GenerationMetric[] = [];
  private errors: string[] = [];

  record(metric: GenerationMetric): void {
    this.metrics.push(metric);
    if (!metric.success) {
      this.errors.push(
        `[${new Date(metric.timestamp).toISOString()}] ${metric.projectId} failed`,
      );
      if (this.errors.length > 50) this.errors.shift();
    }
  }

  getStats(): DashboardStats {
    const total = this.metrics.length;
    if (total === 0)
      return {
        totalGenerations: 0,
        successRate: 0,
        averageScore: 0,
        averageDuration: 0,
        averageRepairs: 0,
        failedCount: 0,
        recentErrors: [],
      };

    const successes = this.metrics.filter((m) => m.success);
    return {
      totalGenerations: total,
      successRate: Math.round((successes.length / total) * 100),
      averageScore: Math.round(
        this.metrics.reduce((s, m) => s + m.qualityScore, 0) / total,
      ),
      averageDuration: Math.round(
        this.metrics.reduce((s, m) => s + m.durationMs, 0) / total,
      ),
      averageRepairs:
        Math.round(
          (this.metrics.reduce((s, m) => s + m.repairIterations, 0) / total) *
            10,
        ) / 10,
      failedCount: total - successes.length,
      recentErrors: this.errors.slice(-10),
    };
  }

  getByGenre(genre: string): GenerationMetric[] {
    return this.metrics.filter((m) => m.genre === genre);
  }

  getRecent(count = 20): GenerationMetric[] {
    return this.metrics.slice(-count);
  }
}
