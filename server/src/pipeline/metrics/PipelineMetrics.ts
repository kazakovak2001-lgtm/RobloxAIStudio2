/**
 * Pipeline Metrics — Tracks performance and cost data for pipeline runs.
 */

export interface PipelineMetricsSnapshot {
  pipelineId: string;
  duration: number;
  stagesCompleted: number;
  stagesTotal: number;
  failures: number;
  retryCount: number;
  tokenUsage: number;
  aiCost: number;
  startedAt: number;
  finishedAt?: number;
}

export class PipelineMetricsCollector {
  private metrics: Map<string, PipelineMetricsSnapshot> = new Map();

  start(pipelineId: string, stagesTotal: number): void {
    this.metrics.set(pipelineId, {
      pipelineId,
      duration: 0,
      stagesCompleted: 0,
      stagesTotal,
      failures: 0,
      retryCount: 0,
      tokenUsage: 0,
      aiCost: 0,
      startedAt: Date.now(),
    });
  }

  stageCompleted(pipelineId: string, durationMs?: number): void {
    const m = this.metrics.get(pipelineId);
    if (!m) return;
    m.stagesCompleted++;
    if (durationMs) m.duration += durationMs;
  }

  stageFailed(pipelineId: string): void {
    const m = this.metrics.get(pipelineId);
    if (!m) return;
    m.failures++;
  }

  retried(pipelineId: string): void {
    const m = this.metrics.get(pipelineId);
    if (!m) return;
    m.retryCount++;
  }

  addTokens(pipelineId: string, tokens: number, cost: number): void {
    const m = this.metrics.get(pipelineId);
    if (!m) return;
    m.tokenUsage += tokens;
    m.aiCost += cost;
  }

  finish(pipelineId: string): void {
    const m = this.metrics.get(pipelineId);
    if (!m) return;
    m.finishedAt = Date.now();
    m.duration = m.finishedAt - m.startedAt;
  }

  get(pipelineId: string): PipelineMetricsSnapshot | null {
    return this.metrics.get(pipelineId) ?? null;
  }

  getAll(): PipelineMetricsSnapshot[] {
    return Array.from(this.metrics.values());
  }
}
