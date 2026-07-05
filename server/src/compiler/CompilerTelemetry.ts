/**
 * CompilerTelemetry.ts
 *
 * Production observability layer.
 * Tracks stage durations, failure rates, CI block frequency, and resource usage.
 * In-memory only — future milestone adds external export.
 */

export interface StageTelemetry {
  stage: string;
  invocations: number;
  failures: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastDurationMs?: number;
  lastExecutedAt?: Date;
}

export interface CompilerTelemetrySummary {
  totalBuilds: number;
  totalFailures: number;
  ciBlockCount: number;
  ciPassCount: number;
  replayCount: number;
  diffCount: number;
  avgBuildDurationMs: number;
  stages: Record<string, StageTelemetry>;
  uptime: number;
}

export class CompilerTelemetry {
  private stages = new Map<string, StageTelemetry>();
  private totalBuilds = 0;
  private totalFailures = 0;
  private ciBlockCount = 0;
  private ciPassCount = 0;
  private replayCount = 0;
  private diffCount = 0;
  private totalBuildDurationMs = 0;
  private startedAt = Date.now();

  /**
   * Record a stage execution.
   */
  recordStage(stage: string, durationMs: number, success: boolean): void {
    const existing = this.stages.get(stage) ?? {
      stage,
      invocations: 0,
      failures: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
    };

    existing.invocations++;
    existing.totalDurationMs += durationMs;
    existing.avgDurationMs = existing.totalDurationMs / existing.invocations;
    existing.lastDurationMs = durationMs;
    existing.lastExecutedAt = new Date();
    if (!success) existing.failures++;

    this.stages.set(stage, existing);
  }

  recordBuild(durationMs: number, success: boolean): void {
    this.totalBuilds++;
    this.totalBuildDurationMs += durationMs;
    if (!success) this.totalFailures++;
  }

  recordCIBlock(): void {
    this.ciBlockCount++;
  }

  recordCIPass(): void {
    this.ciPassCount++;
  }

  recordReplay(): void {
    this.replayCount++;
  }

  recordDiff(): void {
    this.diffCount++;
  }

  /**
   * Get the full telemetry summary.
   */
  getSummary(): CompilerTelemetrySummary {
    const stagesObj: Record<string, StageTelemetry> = {};
    for (const [key, val] of this.stages) {
      stagesObj[key] = val;
    }
    return {
      totalBuilds: this.totalBuilds,
      totalFailures: this.totalFailures,
      ciBlockCount: this.ciBlockCount,
      ciPassCount: this.ciPassCount,
      replayCount: this.replayCount,
      diffCount: this.diffCount,
      avgBuildDurationMs:
        this.totalBuilds > 0 ? this.totalBuildDurationMs / this.totalBuilds : 0,
      stages: stagesObj,
      uptime: Date.now() - this.startedAt,
    };
  }

  /**
   * Get failure rate for a specific stage (0–1).
   */
  getFailureRate(stage: string): number {
    const s = this.stages.get(stage);
    if (!s || s.invocations === 0) return 0;
    return s.failures / s.invocations;
  }
}

let _instance: CompilerTelemetry | null = null;
export function getCompilerTelemetry(): CompilerTelemetry {
  if (!_instance) _instance = new CompilerTelemetry();
  return _instance;
}
