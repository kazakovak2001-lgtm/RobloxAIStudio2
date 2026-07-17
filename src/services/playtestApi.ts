/**
 * Playtest API client — frontend service for automated quality validation.
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

export async function runPlaytest(input: {
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
}): Promise<{ success: boolean; data?: PlaytestReport; error?: string }> {
  try {
    const res = await fetch("/api/playtest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function getPlaytestReport(projectId: string): Promise<{
  success: boolean;
  data?: PlaytestReport;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/playtest/${projectId}`);
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
