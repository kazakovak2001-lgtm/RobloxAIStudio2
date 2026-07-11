/**
 * Playtest Types — Quality validation types for Roblox Experience.
 */

export type IssueSeverity =
  "critical" | "warning" | "suggestion" | "optimization";

export interface PlaytestIssue {
  id: string;
  severity: IssueSeverity;
  category: string;
  affectedArtifact: string;
  reason: string;
  recommendedFix: string;
  priority: number;
}

export interface SystemScore {
  system: string;
  score: number;
  issues: number;
  status: "pass" | "warn" | "fail";
}

export interface PerformanceEstimate {
  scriptCount: number;
  assetCount: number;
  dependencyDepth: number;
  remoteEventCount: number;
  estimatedInitTimeMs: number;
  riskAreas: string[];
}

export interface PlaytestReport {
  projectId: string;
  generatedAt: number;
  overallScore: number;
  classification: "production_ready" | "needs_work" | "critical_issues";
  scores: {
    architecture: number;
    lua: number;
    assets: number;
    dependencies: number;
    gameplay: number;
    performance: number;
  };
  systemScores: SystemScore[];
  issues: PlaytestIssue[];
  performance: PerformanceEstimate;
  recommendations: PlaytestIssue[];
  summary: string;
}

export interface PlaytestInput {
  projectId: string;
  scripts: Array<{
    name: string;
    type: string;
    path: string;
    content: string;
    dependencies: string[];
  }>;
  assets: Array<{
    name: string;
    type: string;
    targetService: string;
    placeholder: boolean;
  }>;
  dependencyGraph?: {
    nodes: string[];
    edges: Array<{ from: string; to: string }>;
    circular: string[][];
  };
}
