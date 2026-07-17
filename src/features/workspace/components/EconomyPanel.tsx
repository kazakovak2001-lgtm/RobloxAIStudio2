import { useState, useCallback } from "react";
import { Card } from "@/shared/ui/Card";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Loader } from "@/shared/ui/Loader";
import { Coins, AlertTriangle, TrendingUp, RotateCcw } from "lucide-react";
import {
  analyzeEconomy,
  type EconomyAnalysisResponse,
} from "@/services/economyApi";

interface EconomyPanelProps {
  projectId: string;
  projectName?: string;
}

export function EconomyPanel({ projectId, projectName }: EconomyPanelProps) {
  const [state, setState] = useState<"idle" | "running" | "success" | "error">(
    "idle",
  );
  const [result, setResult] = useState<EconomyAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const healthVariant = (score: number) => {
    if (score >= 70) return "success" as const;
    if (score >= 40) return "warning" as const;
    return "danger" as const;
  };

  const handleAnalyze = useCallback(async () => {
    setState("running");
    setError(null);

    const blueprint = {
      id: projectId,
      title: projectName ?? "Generated Game",
      genre: "adventure",
      mechanics: ["explore", "collect", "upgrade", "battle", "trade"],
      npcs: [{ id: "npc-shop" }, { id: "npc-quest" }],
      economy: {
        currency: "Gold",
        sources: ["quest-reward", "enemy-drop", "daily-login", "achievement"],
        sinks: ["upgrades", "items", "unlocks", "cosmetics"],
      },
    };

    const res = await analyzeEconomy(blueprint);

    if (res.success && res.data) {
      setResult(res.data);
      setState("success");
    } else {
      setError(res.error ?? "Economy analysis failed");
      setState("error");
    }
  }, [projectId, projectName]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Economy Analysis</h3>
        {state !== "running" && (
          <Button
            variant={state === "success" ? "secondary" : "primary"}
            size="sm"
            onClick={handleAnalyze}
          >
            {state === "success" ? (
              <>
                <RotateCcw className="mr-1 h-3 w-3" /> Re-analyze
              </>
            ) : (
              <>
                <Coins className="mr-1 h-3 w-3" /> Analyze
              </>
            )}
          </Button>
        )}
      </div>

      {/* Loading */}
      {state === "running" && (
        <div className="flex items-center justify-center py-8">
          <Loader size="md" label="Analyzing economy..." />
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="rounded-xl border border-error-500/20 bg-error-500/5 p-4 text-center">
          <p className="text-sm text-error-400">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={handleAnalyze}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Idle */}
      {state === "idle" && (
        <p className="text-sm text-slate-400 py-4">
          Analyze in-game economy balance, detect inflation, and get
          optimization recommendations.
        </p>
      )}

      {/* Success */}
      {state === "success" && result && (
        <div className="space-y-4">
          {/* Health Score + Currency */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
              <Badge variant={healthVariant(result.report.healthScore)}>
                {result.report.healthScore}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-slate-400">Economy Health</p>
              <p className="text-white font-medium">
                {result.model.currency} • Stability: {result.model.stability}
                /100
              </p>
            </div>
          </div>

          {/* Action Required Warning */}
          {result.report.critical > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/5 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-error-400" />
              <p className="text-xs text-error-400">
                {result.report.critical} critical imbalance(s) detected —
                economy rebalancing required.
              </p>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Net Flow</p>
              <p className="text-lg font-semibold text-white">
                {result.model.netFlow > 0 ? "+" : ""}
                {result.model.netFlow}/tick
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {result.model.netFlow > 0
                  ? "Inflationary"
                  : result.model.netFlow < 0
                    ? "Deflationary"
                    : "Balanced"}
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Growth Rate</p>
              <p className="text-lg font-semibold text-white">
                {result.simulation.growthRate > 0 ? "+" : ""}
                {result.simulation.growthRate}%
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
                <div
                  className={`h-1.5 rounded-full ${
                    Math.abs(result.simulation.growthRate) > 100
                      ? "bg-error-400"
                      : Math.abs(result.simulation.growthRate) > 50
                        ? "bg-warning-400"
                        : "bg-success-400"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.abs(result.simulation.growthRate) / 2)}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Final Balance</p>
              <p className="text-lg font-semibold text-white">
                {result.simulation.finalBalance}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                After {result.simulation.ticks} ticks
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Imbalances</p>
              <p className="text-lg font-semibold text-white">
                {result.report.imbalances}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {result.report.critical} critical
              </p>
            </div>
          </div>

          {/* Balance Patch */}
          {result.patch.adjustments > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <TrendingUp className="h-4 w-4 text-brand-400" />
              <div>
                <p className="text-xs text-slate-400">
                  Balance Recommendations
                </p>
                <p className="text-sm text-white">
                  {result.patch.adjustments} adjustment(s) •{" "}
                  {Math.round(result.patch.confidence * 100)}% confidence
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
