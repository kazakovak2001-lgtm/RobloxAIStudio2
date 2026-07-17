/**
 * Analytics API client — frontend service for the analytics feedback loop.
 */

export interface SystemHealthReport {
  overallScore: number;
  agentHealth: number;
  pipelineHealth: number;
  memoryHealth: number;
  failureRate: number;
  averageExecutionScore: number;
  activePatterns: number;
  suggestions: number;
  timestamp: number;
  cycleCount?: number;
  lastCycleAt?: number;
  recordCount?: number;
  signalCount?: number;
}

export interface AgentPerformanceSummary {
  agent: string;
  totalExecutions: number;
  successRate: number;
  averageScore: number;
  averageDurationMs: number;
  minScore: number;
  maxScore: number;
  failureCount: number;
  trend: "improving" | "degrading" | "stable";
}

export interface FailurePattern {
  patternId: string;
  type: string;
  agent: string;
  frequency: number;
  lastOccurrence: number;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface OptimizationSuggestion {
  id: string;
  type: string;
  priority: "low" | "medium" | "high";
  description: string;
  expectedImprovement: string;
  affectedNodes: string[];
  confidence: number;
}

export async function getSystemHealth(): Promise<{
  success: boolean;
  data?: SystemHealthReport;
  error?: string;
}> {
  try {
    const res = await fetch("/api/analytics/system");
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

export async function getAgentSummaries(): Promise<{
  success: boolean;
  data?: { count: number; agents: AgentPerformanceSummary[] };
  error?: string;
}> {
  try {
    const res = await fetch("/api/analytics/agents");
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

export async function getFailurePatterns(severity?: string): Promise<{
  success: boolean;
  data?: { count: number; patterns: FailurePattern[] };
  error?: string;
}> {
  try {
    const url = severity
      ? `/api/analytics/patterns?severity=${severity}`
      : "/api/analytics/patterns";
    const res = await fetch(url);
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

export async function getOptimizationSuggestions(priority?: string): Promise<{
  success: boolean;
  data?: { count: number; suggestions: OptimizationSuggestion[] };
  error?: string;
}> {
  try {
    const url = priority
      ? `/api/analytics/suggestions?priority=${priority}`
      : "/api/analytics/suggestions";
    const res = await fetch(url);
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

export async function getSlowestAgents(n = 5): Promise<{
  success: boolean;
  data?: AgentPerformanceSummary[];
  error?: string;
}> {
  try {
    const res = await fetch(`/api/analytics/slowest?n=${n}`);
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

export async function getLowestScoringAgents(n = 5): Promise<{
  success: boolean;
  data?: AgentPerformanceSummary[];
  error?: string;
}> {
  try {
    const res = await fetch(`/api/analytics/lowest-scores?n=${n}`);
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

export async function triggerAnalyticsCycle(): Promise<{
  success: boolean;
  data?: {
    ingested: number;
    agentsAnalyzed: number;
    patternsDetected: number;
    signalsGenerated: number;
    suggestionsCreated: number;
  };
  error?: string;
}> {
  try {
    const res = await fetch("/api/analytics/cycle", { method: "POST" });
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
