/**
 * AgentPerformanceMemory.ts
 *
 * Stores and queries historical agent execution data.
 * Provides the "intelligence dataset" that the AgentDecisionEngine uses
 * to make adaptive selection decisions.
 *
 * Tracks:
 *   - Per-agent success/failure history
 *   - Task-type performance matrix
 *   - Context-dependent success patterns
 */

import type {
  AgentExecutionRecord,
  TaskTypePerformance,
  AgentScore,
} from "./types";

export class AgentPerformanceMemory {
  private records: AgentExecutionRecord[] = [];
  private maxRecords = 10000;

  /**
   * Record an agent execution result.
   */
  record(entry: AgentExecutionRecord): void {
    this.records.push(entry);
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }

  /**
   * Get all records for a specific agent.
   */
  getAgentHistory(agent: string): AgentExecutionRecord[] {
    return this.records.filter((r) => r.agent === agent);
  }

  /**
   * Get all records for a specific task type.
   */
  getTaskTypeHistory(taskType: string): AgentExecutionRecord[] {
    return this.records.filter((r) => r.taskType === taskType);
  }

  /**
   * Compute AgentScore from historical data.
   */
  computeScore(agent: string, contextKeys: string[] = []): AgentScore {
    const history = this.getAgentHistory(agent);

    if (history.length === 0) {
      return this.defaultScore(agent);
    }

    const successCount = history.filter((r) => r.success).length;
    const successRate = successCount / history.length;
    const qualities = history.map((r) => r.quality);
    const avgQuality = qualities.reduce((a, b) => a + b, 0) / qualities.length;
    const durations = history.map((r) => r.durationMs);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Speed score: inversely proportional to duration (5s = 100, 30s = 0)
    const speedScore = Math.max(
      0,
      Math.min(100, Math.round((1 - avgDuration / 30000) * 100)),
    );

    // Reliability: consistency (low variance = high reliability)
    const variance =
      qualities.reduce((sum, q) => sum + (q - avgQuality) ** 2, 0) /
      qualities.length;
    const stdDev = Math.sqrt(variance);
    const reliabilityIndex = Math.max(
      0,
      Math.min(100, Math.round(100 - stdDev * 2)),
    );

    // Context fit: how well this agent performs with similar context
    const contextFitScore = this.computeContextFit(agent, contextKeys);

    return {
      agent,
      successRate,
      avgQuality,
      speedScore,
      reliabilityIndex,
      contextFitScore,
      compositeScore: 0, // computed by policy
      executionCount: history.length,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get task-type performance matrix for an agent.
   */
  getTaskTypePerformance(agent: string): TaskTypePerformance[] {
    const history = this.getAgentHistory(agent);
    const byTaskType = new Map<string, AgentExecutionRecord[]>();

    for (const rec of history) {
      if (!byTaskType.has(rec.taskType)) byTaskType.set(rec.taskType, []);
      byTaskType.get(rec.taskType)!.push(rec);
    }

    return [...byTaskType.entries()].map(([taskType, records]) => {
      const successCount = records.filter((r) => r.success).length;
      return {
        taskType,
        agent,
        executionCount: records.length,
        successRate: successCount / records.length,
        avgQuality:
          records.reduce((sum, r) => sum + r.quality, 0) / records.length,
        avgDurationMs:
          records.reduce((sum, r) => sum + r.durationMs, 0) / records.length,
      };
    });
  }

  /**
   * Get the best agent for a specific task type based on history.
   */
  getBestAgentForTask(
    taskType: string,
    agents: string[],
  ): { agent: string; score: number } | null {
    const candidates: Array<{ agent: string; score: number }> = [];

    for (const agent of agents) {
      const records = this.records.filter(
        (r) => r.agent === agent && r.taskType === taskType,
      );
      if (records.length === 0) continue;

      const successRate =
        records.filter((r) => r.success).length / records.length;
      const avgQuality =
        records.reduce((sum, r) => sum + r.quality, 0) / records.length;
      const score = successRate * 50 + avgQuality * 0.5;
      candidates.push({ agent, score });
    }

    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * Get all known agent names.
   */
  getKnownAgents(): string[] {
    return [...new Set(this.records.map((r) => r.agent))];
  }

  get size(): number {
    return this.records.length;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private computeContextFit(agent: string, contextKeys: string[]): number {
    if (contextKeys.length === 0) return 50; // neutral

    const history = this.getAgentHistory(agent);
    if (history.length === 0) return 50;

    // Find records with overlapping context keys
    let matchCount = 0;
    let matchQuality = 0;

    for (const rec of history) {
      const overlap = rec.contextKeys.filter((k) => contextKeys.includes(k));
      if (overlap.length > 0) {
        matchCount++;
        matchQuality += rec.quality;
      }
    }

    if (matchCount === 0) return 50;
    return Math.min(100, Math.round(matchQuality / matchCount));
  }

  private defaultScore(agent: string): AgentScore {
    return {
      agent,
      successRate: 0.5,
      avgQuality: 50,
      speedScore: 50,
      reliabilityIndex: 50,
      contextFitScore: 50,
      compositeScore: 50,
      executionCount: 0,
      lastUpdated: Date.now(),
    };
  }
}
