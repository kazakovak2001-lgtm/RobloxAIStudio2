/**
 * Type-level integration tests for analyticsApi.
 * Verifies exported types are assignable.
 */
import { describe, it, expect } from "vitest";
import type {
  SystemHealthReport,
  AgentPerformanceSummary,
  FailurePattern,
  OptimizationSuggestion,
} from "../analyticsApi";

describe("analyticsApi types", () => {
  it("SystemHealthReport is assignable", () => {
    const report: SystemHealthReport = {
      overallScore: 90,
      agentHealth: 85,
      pipelineHealth: 88,
      memoryHealth: 80,
      failureRate: 0.02,
      averageExecutionScore: 92,
      activePatterns: 1,
      suggestions: 3,
      timestamp: Date.now(),
    };
    expect(report.overallScore).toBe(90);
  });

  it("AgentPerformanceSummary supports all trend values", () => {
    const improving: AgentPerformanceSummary = {
      agent: "A",
      totalExecutions: 10,
      successRate: 0.9,
      averageScore: 80,
      averageDurationMs: 1000,
      minScore: 50,
      maxScore: 100,
      failureCount: 1,
      trend: "improving",
    };
    const degrading: AgentPerformanceSummary = {
      ...improving,
      trend: "degrading",
    };
    const stable: AgentPerformanceSummary = { ...improving, trend: "stable" };
    expect(improving.trend).toBe("improving");
    expect(degrading.trend).toBe("degrading");
    expect(stable.trend).toBe("stable");
  });

  it("FailurePattern supports all severity levels", () => {
    const pattern: FailurePattern = {
      patternId: "p1",
      type: "timeout",
      agent: "CodeGen",
      frequency: 5,
      lastOccurrence: Date.now(),
      description: "Timeout",
      severity: "critical",
    };
    expect(["low", "medium", "high", "critical"]).toContain(pattern.severity);
  });

  it("OptimizationSuggestion has confidence between 0 and 1", () => {
    const suggestion: OptimizationSuggestion = {
      id: "s1",
      type: "parallelize",
      priority: "high",
      description: "Run in parallel",
      expectedImprovement: "2x faster",
      affectedNodes: ["n1"],
      confidence: 0.95,
    };
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
    expect(suggestion.confidence).toBeLessThanOrEqual(1);
  });
});
