/**
 * PlaytestEngine — deterministic static analysis of generated source and plans.
 *
 * PLAYTEST-TRUTH-1. Not a playtest in any runtime sense, and no longer named
 * as one in what it produces. It reads generated Lua and asset plans, applies
 * deterministic rules, and reports what it found. It runs nothing, observes no
 * player, and measures no quality.
 */

import {
  countFindings,
  PLAYTEST_REPORT_SCHEMA_VERSION,
  RUNTIME_NOT_MEASURED,
  type FindingCounts,
  type PlaytestInput,
  type PlaytestReport,
  type PerformanceEstimate,
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
    const { issues, systems } = this.ruleEngine.run(input);
    const performance = this.analyzePerformance(input);
    const findingCounts = countFindings(issues);

    const recommendations = issues.filter(
      (i) => i.severity === "suggestion" || i.severity === "optimization",
    );

    const report: PlaytestReport = {
      schemaVersion: PLAYTEST_REPORT_SCHEMA_VERSION,
      evidenceKind: "static-analysis",
      projectId: input.projectId,
      generatedAt: Date.now(),
      // Stated, not omitted. An absent field reads as an oversight and a zero
      // reads as a failing grade; neither is true.
      runtime: RUNTIME_NOT_MEASURED,
      findingCounts,
      issues,
      systems,
      performance,
      recommendations,
      summary: this.buildSummary(findingCounts, input),
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

  /**
   * State what was found, and what was not looked at.
   *
   * No grade and no verdict. The previous summary opened with
   * "Production Ready (85/100)" for source that contained a `pcall`.
   */
  private buildSummary(counts: FindingCounts, input: PlaytestInput): string {
    return (
      `Static analysis of ${input.scripts.length} script${input.scripts.length !== 1 ? "s" : ""} ` +
      `and ${input.assets.length} planned asset${input.assets.length !== 1 ? "s" : ""}: ` +
      `${counts.critical} critical, ${counts.warning} warning, ` +
      `${counts.total} finding${counts.total !== 1 ? "s" : ""} in total. ` +
      `Runtime quality is not measured.`
    );
  }
}
