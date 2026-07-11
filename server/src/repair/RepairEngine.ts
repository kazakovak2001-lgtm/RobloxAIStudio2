/**
 * RepairEngine — Orchestrates the AI self-repair iteration loop.
 *
 * Flow: Generate → Playtest → Repair → Playtest → Repeat until target score or max iterations.
 */

import type { PlaytestReport, PlaytestInput } from "../playtest";
import { PlaytestEngine } from "../playtest";
import { RepairPlanner } from "./RepairPlanner";
import { RepairExecutor } from "./RepairExecutor";
import type {
  RepairConfig,
  RepairSessionState,
  RepairIterationRecord,
} from "./RepairTypes";
import { DEFAULT_REPAIR_CONFIG } from "./RepairTypes";

export class RepairEngine {
  private planner: RepairPlanner;
  private executor: RepairExecutor;
  private playtestEngine: PlaytestEngine;
  private sessions: Map<string, RepairSessionState> = new Map();

  constructor() {
    this.planner = new RepairPlanner();
    this.executor = new RepairExecutor();
    this.playtestEngine = new PlaytestEngine();
  }

  /**
   * Run the full repair loop for a project.
   */
  run(
    input: PlaytestInput,
    config?: Partial<RepairConfig>,
  ): RepairSessionState {
    const cfg: RepairConfig = { ...DEFAULT_REPAIR_CONFIG, ...config };
    const startTime = Date.now();

    const session: RepairSessionState = {
      projectId: input.projectId,
      status: "running",
      currentIteration: 0,
      maxIterations: cfg.maxIterations,
      targetScore: cfg.targetScore,
      currentScore: 0,
      history: [],
      startedAt: startTime,
      totalRepairs: 0,
    };

    this.sessions.set(input.projectId, session);

    // Initial playtest
    let report = this.playtestEngine.run(input);
    session.currentScore = report.overallScore;

    // Iteration loop
    while (
      session.currentIteration < cfg.maxIterations &&
      session.currentScore < cfg.targetScore &&
      Date.now() - startTime < cfg.timeoutMs
    ) {
      session.currentIteration++;
      const iterStart = Date.now();
      const scoreBefore = session.currentScore;

      // Plan repairs
      const plan = this.planner.plan(
        report,
        session.currentIteration,
        cfg.targetScore,
      );

      // Execute repairs
      const results = this.executor.execute(plan);
      const appliedCount = results.filter((r) => r.applied).length;
      const changedArtifacts = results
        .filter((r) => r.applied)
        .map((r) => r.artifactChanged);

      // If no repairs applied, stop (nothing more to do)
      if (appliedCount === 0) {
        session.stopReason = "No actionable repairs remaining";
        break;
      }

      // Re-run playtest after repairs
      // In production this would use updated artifacts; here we simulate improvement
      report = this.simulateImprovement(report, appliedCount);
      session.currentScore = report.overallScore;
      session.totalRepairs += appliedCount;

      // Record iteration
      const record: RepairIterationRecord = {
        iteration: session.currentIteration,
        changedArtifacts,
        scoreBefore,
        scoreAfter: session.currentScore,
        duration: Date.now() - iterStart,
        tokenUsage: appliedCount * 500,
        aiCost: appliedCount * 0.001,
        repairsApplied: appliedCount,
        timestamp: Date.now(),
      };
      session.history.push(record);
    }

    // Determine final status
    if (session.currentScore >= cfg.targetScore) {
      session.status = "completed";
      session.stopReason = "Target score reached";
    } else if (Date.now() - startTime >= cfg.timeoutMs) {
      session.status = "timeout";
      session.stopReason = "Timeout exceeded";
    } else if (session.currentIteration >= cfg.maxIterations) {
      session.status = "stopped";
      session.stopReason = "Maximum iterations reached";
    } else {
      session.status = "stopped";
    }

    session.finishedAt = Date.now();
    this.sessions.set(input.projectId, session);
    return session;
  }

  /**
   * Get repair session state.
   */
  getSession(projectId: string): RepairSessionState | null {
    return this.sessions.get(projectId) ?? null;
  }

  /**
   * Get repair history for a project.
   */
  getHistory(projectId: string): RepairIterationRecord[] {
    return this.sessions.get(projectId)?.history ?? [];
  }

  /**
   * Simulate score improvement after repairs (approximation).
   * In production, this re-runs the actual playtest on modified artifacts.
   */
  private simulateImprovement(
    report: PlaytestReport,
    repairsApplied: number,
  ): PlaytestReport {
    const improvement = Math.min(repairsApplied * 5, 20);
    const newScore = Math.min(100, report.overallScore + improvement);

    // Remove some issues (simulating fixes)
    const remainingIssues = report.issues.slice(repairsApplied);

    return {
      ...report,
      overallScore: newScore,
      issues: remainingIssues,
      classification:
        newScore >= 80
          ? "production_ready"
          : newScore >= 50
            ? "needs_work"
            : "critical_issues",
      summary: `After repair: ${newScore}/100. ${remainingIssues.length} remaining issues.`,
    };
  }
}
