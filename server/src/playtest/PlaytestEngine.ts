/**
 * PlaytestEngine — Top-level facade for automated experience quality validation.
 */

import type {
  PlaytestInput,
  PlaytestReport,
  PerformanceEstimate,
} from "./PlaytestTypes";
import { PlaytestRuleEngine } from "./PlaytestRuleEngine";

export class PlaytestEngine {
  private ruleEngine: PlaytestRuleEngine;
  private reports: Map<string, PlaytestReport> = new Map();

  constructor() {
    this.ruleEngine = new PlaytestRuleEngine();
  }

  /**
   * Run a full playtest analysis on a project.
   */
  run(input: PlaytestInput): PlaytestReport {
    const { issues, systemScores } = this.ruleEngine.run(input);
    const performance = this.analyzePerformance(input);

    const scores = {
      architecture: this.scoreCategory(issues, "architecture"),
      lua: this.scoreLua(input),
      assets: this.scoreCategory(issues, "assets"),
      dependencies: this.scoreCategory(issues, "dependencies"),
      gameplay: this.scoreCategory(issues, "gameplay"),
      performance:
        performance.estimatedInitTimeMs < 3000
          ? 90
          : performance.estimatedInitTimeMs < 5000
            ? 70
            : 50,
    };

    const overallScore = Math.round(
      Object.values(scores).reduce((sum, s) => sum + s, 0) /
        Object.keys(scores).length,
    );

    const criticals = issues.filter((i) => i.severity === "critical");
    const recommendations = issues.filter(
      (i) => i.severity === "suggestion" || i.severity === "optimization",
    );

    const report: PlaytestReport = {
      projectId: input.projectId,
      generatedAt: Date.now(),
      overallScore,
      classification:
        overallScore >= 80
          ? "production_ready"
          : overallScore >= 50
            ? "needs_work"
            : "critical_issues",
      scores,
      systemScores,
      issues,
      performance,
      recommendations,
      summary: this.buildSummary(
        overallScore,
        criticals.length,
        issues.length,
        input,
      ),
    };

    this.reports.set(input.projectId, report);
    return report;
  }

  /**
   * Get a previously generated report.
   */
  getReport(projectId: string): PlaytestReport | null {
    return this.reports.get(projectId) ?? null;
  }

  private analyzePerformance(input: PlaytestInput): PerformanceEstimate {
    const scriptCount = input.scripts.length;
    const assetCount = input.assets.length;
    const depDepth = input.dependencyGraph
      ? Math.max(
          ...input.dependencyGraph.nodes.map((n) =>
            this.getDepthFor(n, input.dependencyGraph!.edges),
          ),
          0,
        )
      : 0;
    const remoteCount = input.scripts.filter(
      (s) =>
        s.content.includes("RemoteEvent") ||
        s.content.includes("RemoteFunction"),
    ).length;

    const estimatedInitTimeMs =
      scriptCount * 50 + assetCount * 20 + depDepth * 100 + remoteCount * 30;

    const riskAreas: string[] = [];
    if (scriptCount > 15)
      riskAreas.push("High script count may slow initialization");
    if (depDepth > 5)
      riskAreas.push("Deep dependency chain — consider flattening");
    if (remoteCount > 10)
      riskAreas.push("Many RemoteEvents — batch where possible");
    if (assetCount > 30) riskAreas.push("Large asset count — use streaming");

    return {
      scriptCount,
      assetCount,
      dependencyDepth: depDepth,
      remoteEventCount: remoteCount,
      estimatedInitTimeMs,
      riskAreas,
    };
  }

  private getDepthFor(
    node: string,
    edges: Array<{ from: string; to: string }>,
  ): number {
    const deps = edges.filter((e) => e.from === node);
    if (deps.length === 0) return 0;
    return 1 + Math.max(...deps.map((d) => this.getDepthFor(d.to, edges)));
  }

  private scoreCategory(
    issues: Array<{ severity: string; category: string }>,
    category: string,
  ): number {
    const catIssues = issues.filter((i) => i.category === category);
    let score = 100;
    for (const issue of catIssues) {
      if (issue.severity === "critical") score -= 25;
      else if (issue.severity === "warning") score -= 10;
      else score -= 3;
    }
    return Math.max(0, Math.min(100, score));
  }

  private scoreLua(input: PlaytestInput): number {
    if (input.scripts.length === 0) return 50;
    let score = 80;
    if (input.scripts.length >= 5) score += 10;
    if (input.scripts.some((s) => s.content.includes("pcall"))) score += 5;
    if (input.scripts.some((s) => s.content.includes("--[["))) score += 5;
    return Math.min(100, score);
  }

  private buildSummary(
    score: number,
    criticals: number,
    total: number,
    input: PlaytestInput,
  ): string {
    const status =
      score >= 80
        ? "Production Ready"
        : score >= 50
          ? "Needs Work"
          : "Critical Issues";
    return (
      `${status} (${score}/100). ${input.scripts.length} scripts, ${input.assets.length} assets. ` +
      `${criticals} critical issue${criticals !== 1 ? "s" : ""}, ${total} total findings.`
    );
  }
}
