/**
 * PatternDetector.ts
 *
 * Detects recurring patterns in execution data:
 *   - Repeated failure loops (same agent failing multiple times)
 *   - Cascade failures (one failure causing downstream failures)
 *   - Timeout patterns
 *   - Low-score streaks
 *   - Inconsistent outputs
 *
 * Safe mode: detection only, no automatic remediation.
 */

import { randomUUID } from "crypto";
import type { AgentPerformanceRecord, FailurePattern } from "./types";

export class PatternDetector {
  private patterns: FailurePattern[] = [];

  /**
   * Analyze records and detect all patterns.
   */
  detect(records: AgentPerformanceRecord[]): FailurePattern[] {
    this.patterns = [];

    this.detectRepeatedFailures(records);
    this.detectCascadeFailures(records);
    this.detectTimeoutPatterns(records);
    this.detectLowScoreStreaks(records);
    this.detectInconsistentOutputs(records);

    return this.patterns;
  }

  /**
   * Get all detected patterns.
   */
  getPatterns(): FailurePattern[] {
    return [...this.patterns];
  }

  /**
   * Get patterns filtered by severity.
   */
  getPatternsBySeverity(
    severity: FailurePattern["severity"],
  ): FailurePattern[] {
    return this.patterns.filter((p) => p.severity === severity);
  }

  /**
   * Get patterns for a specific agent.
   */
  getPatternsForAgent(agent: string): FailurePattern[] {
    return this.patterns.filter((p) => p.agent === agent);
  }

  // ─── Pattern Detection Algorithms ────────────────────────────────────

  /**
   * Detect agents that fail repeatedly (>= 3 failures).
   */
  private detectRepeatedFailures(records: AgentPerformanceRecord[]): void {
    const failuresByAgent = new Map<string, AgentPerformanceRecord[]>();
    for (const rec of records.filter((r) => r.failed)) {
      if (!failuresByAgent.has(rec.agent)) failuresByAgent.set(rec.agent, []);
      failuresByAgent.get(rec.agent)!.push(rec);
    }

    for (const [agent, failures] of failuresByAgent) {
      if (failures.length >= 3) {
        const severity =
          failures.length >= 10
            ? "critical"
            : failures.length >= 5
              ? "high"
              : "medium";
        this.patterns.push({
          patternId: `pat-${randomUUID().slice(0, 8)}`,
          type: "repeated-failure",
          agent,
          frequency: failures.length,
          lastOccurrence: Math.max(...failures.map((f) => f.timestamp)),
          description: `Agent "${agent}" has failed ${failures.length} times across executions`,
          severity,
        });
      }
    }
  }

  /**
   * Detect cascade failures: when one agent's failure is followed by
   * multiple other failures in the same execution.
   */
  private detectCascadeFailures(records: AgentPerformanceRecord[]): void {
    // Group by execution
    const byExecution = new Map<string, AgentPerformanceRecord[]>();
    for (const rec of records) {
      if (!byExecution.has(rec.executionId))
        byExecution.set(rec.executionId, []);
      byExecution.get(rec.executionId)!.push(rec);
    }

    for (const [executionId, execRecords] of byExecution) {
      const sorted = execRecords.sort((a, b) => a.timestamp - b.timestamp);
      const failures = sorted.filter((r) => r.failed);

      if (failures.length >= 3) {
        // First failure is the cascade trigger
        const trigger = failures[0];
        this.patterns.push({
          patternId: `pat-${randomUUID().slice(0, 8)}`,
          type: "cascade-failure",
          agent: trigger.agent,
          frequency: failures.length,
          lastOccurrence: trigger.timestamp,
          description: `Cascade failure in execution ${executionId}: "${trigger.agent}" triggered ${failures.length - 1} downstream failures`,
          severity: failures.length >= 5 ? "critical" : "high",
        });
      }
    }
  }

  /**
   * Detect timeout patterns: agents consistently taking >10s.
   */
  private detectTimeoutPatterns(records: AgentPerformanceRecord[]): void {
    const slowByAgent = new Map<string, number[]>();
    for (const rec of records) {
      if (rec.durationMs > 10000) {
        if (!slowByAgent.has(rec.agent)) slowByAgent.set(rec.agent, []);
        slowByAgent.get(rec.agent)!.push(rec.durationMs);
      }
    }

    for (const [agent, durations] of slowByAgent) {
      if (durations.length >= 2) {
        const avgDuration =
          durations.reduce((a, b) => a + b, 0) / durations.length;
        this.patterns.push({
          patternId: `pat-${randomUUID().slice(0, 8)}`,
          type: "timeout",
          agent,
          frequency: durations.length,
          lastOccurrence: Date.now(),
          description: `Agent "${agent}" consistently slow: avg ${Math.round(avgDuration)}ms (${durations.length} occurrences >10s)`,
          severity: avgDuration > 30000 ? "high" : "medium",
        });
      }
    }
  }

  /**
   * Detect low-score streaks: agent scoring below 50 multiple times.
   */
  private detectLowScoreStreaks(records: AgentPerformanceRecord[]): void {
    const lowByAgent = new Map<string, number[]>();
    for (const rec of records) {
      if (rec.evaluationScore < 50 && !rec.failed) {
        if (!lowByAgent.has(rec.agent)) lowByAgent.set(rec.agent, []);
        lowByAgent.get(rec.agent)!.push(rec.evaluationScore);
      }
    }

    for (const [agent, scores] of lowByAgent) {
      if (scores.length >= 3) {
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        this.patterns.push({
          patternId: `pat-${randomUUID().slice(0, 8)}`,
          type: "low-score",
          agent,
          frequency: scores.length,
          lastOccurrence: Date.now(),
          description: `Agent "${agent}" consistently low quality: avg score ${Math.round(avgScore)} (${scores.length} occurrences below 50)`,
          severity: avgScore < 30 ? "high" : "medium",
        });
      }
    }
  }

  /**
   * Detect inconsistent outputs: high variance in evaluation scores.
   */
  private detectInconsistentOutputs(records: AgentPerformanceRecord[]): void {
    const scoresByAgent = new Map<string, number[]>();
    for (const rec of records.filter((r) => !r.failed)) {
      if (!scoresByAgent.has(rec.agent)) scoresByAgent.set(rec.agent, []);
      scoresByAgent.get(rec.agent)!.push(rec.evaluationScore);
    }

    for (const [agent, scores] of scoresByAgent) {
      if (scores.length < 4) continue;

      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance =
        scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 25) {
        this.patterns.push({
          patternId: `pat-${randomUUID().slice(0, 8)}`,
          type: "inconsistent-output",
          agent,
          frequency: scores.length,
          lastOccurrence: Date.now(),
          description: `Agent "${agent}" has inconsistent quality: σ=${Math.round(stdDev)}, range [${Math.round(Math.min(...scores))}–${Math.round(Math.max(...scores))}]`,
          severity: stdDev > 35 ? "high" : "medium",
        });
      }
    }
  }
}
