import { useEffect, useState, useCallback } from "react";
import { Card } from "@/shared/ui/Card";
import { Button } from "@/shared/ui/Button";
import { Badge } from "@/shared/ui/Badge";
import { Loader } from "@/shared/ui/Loader";
import {
  getSystemHealth,
  getAgentSummaries,
  getFailurePatterns,
  getOptimizationSuggestions,
  triggerAnalyticsCycle,
} from "@/services/analyticsApi";
import type {
  SystemHealthReport,
  AgentPerformanceSummary,
  FailurePattern,
  OptimizationSuggestion,
} from "@/services/analyticsApi";

type LoadState = "loading" | "error" | "empty" | "ready";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("7d");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [health, setHealth] = useState<SystemHealthReport | null>(null);
  const [agents, setAgents] = useState<AgentPerformanceSummary[]>([]);
  const [patterns, setPatterns] = useState<FailurePattern[]>([]);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);

  const fetchAll = useCallback(async () => {
    setLoadState("loading");
    setErrorMsg("");

    const [healthRes, agentsRes, patternsRes, suggestionsRes] =
      await Promise.all([
        getSystemHealth(),
        getAgentSummaries(),
        getFailurePatterns(),
        getOptimizationSuggestions(),
      ]);

    if (!healthRes.success) {
      setErrorMsg(healthRes.error ?? "Failed to fetch system health");
      setLoadState("error");
      return;
    }

    setHealth(healthRes.data ?? null);
    setAgents(agentsRes.data?.agents ?? []);
    setPatterns(patternsRes.data?.patterns ?? []);
    setSuggestions(suggestionsRes.data?.suggestions ?? []);

    const hasData =
      healthRes.data ||
      (agentsRes.data?.agents.length ?? 0) > 0 ||
      (patternsRes.data?.patterns.length ?? 0) > 0;

    setLoadState(hasData ? "ready" : "empty");
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await triggerAnalyticsCycle();
    await fetchAll();
    setRefreshing(false);
  };

  // --- Severity badge variant mapping ---
  const severityVariant = (s: FailurePattern["severity"]) => {
    switch (s) {
      case "critical":
        return "danger" as const;
      case "high":
        return "danger" as const;
      case "medium":
        return "warning" as const;
      case "low":
        return "default" as const;
    }
  };

  const trendVariant = (t: AgentPerformanceSummary["trend"]) => {
    switch (t) {
      case "improving":
        return "success" as const;
      case "degrading":
        return "danger" as const;
      case "stable":
        return "default" as const;
    }
  };

  const priorityVariant = (p: OptimizationSuggestion["priority"]) => {
    switch (p) {
      case "high":
        return "danger" as const;
      case "medium":
        return "warning" as const;
      case "low":
        return "default" as const;
    }
  };

  // --- Render states ---
  if (loadState === "loading") {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader size="lg" label="Loading analytics..." />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Card hover={false}>
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-error-400 text-sm">{errorMsg}</p>
            <Button variant="secondary" onClick={fetchAll}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loadState === "empty") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Card hover={false}>
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-slate-400 text-sm">
              No analytics data yet. Run a pipeline to generate metrics.
            </p>
            <Button variant="secondary" onClick={handleRefresh}>
              Refresh Analytics
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
            Analytics
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Platform Insights
          </h1>
          <p className="mt-2 text-slate-400">
            Monitor agent performance, failure patterns, and optimization
            opportunities.
          </p>
        </div>
        <div className="flex gap-2">
          {["7d", "30d", "90d"].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                timeRange === range
                  ? "bg-brand-500 text-white"
                  : "border border-white/10 text-slate-300 hover:bg-white/5"
              }`}
              type="button"
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Top metric cards */}
      <div className="grid gap-4 lg:grid-cols-4 mb-8">
        <Card>
          <p className="text-sm text-slate-400">Overall Score</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {health?.overallScore ?? 0}
            <span className="text-sm text-slate-400">/100</span>
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-brand-500 transition-all"
              style={{ width: `${health?.overallScore ?? 0}%` }}
            />
          </div>
        </Card>

        <Card>
          <p className="text-sm text-slate-400">Agent Health</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {health?.agentHealth ?? 0}
            <span className="text-sm text-slate-400">/100</span>
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-success-400 transition-all"
              style={{ width: `${health?.agentHealth ?? 0}%` }}
            />
          </div>
        </Card>

        <Card>
          <p className="text-sm text-slate-400">Pipeline Health</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {health?.pipelineHealth ?? 0}
            <span className="text-sm text-slate-400">/100</span>
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-success-400 transition-all"
              style={{ width: `${health?.pipelineHealth ?? 0}%` }}
            />
          </div>
        </Card>

        <Card>
          <p className="text-sm text-slate-400">Failure Rate</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {((health?.failureRate ?? 0) * 100).toFixed(1)}%
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-error-400 transition-all"
              style={{ width: `${(health?.failureRate ?? 0) * 100}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Two-column content */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Left: Agent Performance */}
        <Card hover={false}>
          <h3 className="text-lg font-semibold text-white mb-4">
            Agent Performance
          </h3>
          {agents.length === 0 ? (
            <p className="text-sm text-slate-400">No agent data available.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {agents.map((a) => (
                <div
                  key={a.agent}
                  className="rounded-xl border border-white/5 bg-slate-950/50 p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white truncate max-w-[140px]">
                      {a.agent}
                    </span>
                    <Badge variant={trendVariant(a.trend)}>{a.trend}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>Score: {a.averageScore.toFixed(1)}</span>
                    <span>Runs: {a.totalExecutions}</span>
                    <span>Success: {(a.successRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-brand-500 transition-all"
                      style={{ width: `${a.averageScore}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Right: Failure Patterns */}
        <Card hover={false}>
          <h3 className="text-lg font-semibold text-white mb-4">
            Failure Patterns
          </h3>
          {patterns.length === 0 ? (
            <p className="text-sm text-slate-400">
              No failure patterns detected.
            </p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {patterns.map((p) => (
                <div
                  key={p.patternId}
                  className="rounded-xl border border-white/5 bg-slate-950/50 p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white truncate max-w-[180px]">
                      {p.agent}
                    </span>
                    <Badge variant={severityVariant(p.severity)}>
                      {p.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">
                    {p.description}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>Type: {p.type}</span>
                    <span>Freq: {p.frequency}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Full-width: Optimization Suggestions */}
      <Card hover={false} className="lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Optimization Suggestions
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Analytics"}
          </Button>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-slate-400">
            No optimization suggestions at this time.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-white/5 bg-slate-950/50 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={priorityVariant(s.priority)}>
                    {s.priority}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {(s.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="text-sm text-white mb-1">{s.description}</p>
                <p className="text-xs text-success-400">
                  Expected: {s.expectedImprovement}
                </p>
                {s.affectedNodes.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500 truncate">
                    Affects: {s.affectedNodes.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
