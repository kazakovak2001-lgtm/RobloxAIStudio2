import { useState, useCallback } from "react";
import { Card } from "@/shared/ui/Card";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Loader } from "@/shared/ui/Loader";
import { Play, AlertTriangle, RotateCcw } from "lucide-react";
import {
  runFullSimulation,
  type SimulationResponse,
} from "@/services/simulationApi";

interface SimulationPanelProps {
  projectId: string;
  projectName?: string;
}

export function SimulationPanel({
  projectId,
  projectName,
}: SimulationPanelProps) {
  const [state, setState] = useState<"idle" | "running" | "success" | "error">(
    "idle",
  );
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gradeVariant = (grade: string) => {
    switch (grade) {
      case "A":
      case "B":
        return "success" as const;
      case "C":
        return "warning" as const;
      default:
        return "danger" as const;
    }
  };

  const handleRun = useCallback(async () => {
    setState("running");
    setError(null);

    const blueprint = {
      id: projectId,
      title: projectName ?? "Generated Game",
      genre: "adventure",
      mechanics: ["explore", "collect", "upgrade", "battle", "trade"],
      npcs: [{ id: "npc-shop" }, { id: "npc-quest" }, { id: "npc-guide" }],
    };

    const res = await runFullSimulation(blueprint);

    if (res.success && res.data) {
      setResult(res.data);
      setState("success");
    } else {
      setError(res.error ?? "Simulation failed");
      setState("error");
    }
  }, [projectId, projectName]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Game Simulation</h3>
        {state !== "running" && (
          <Button
            variant={state === "success" ? "secondary" : "primary"}
            size="sm"
            onClick={handleRun}
          >
            {state === "success" ? (
              <>
                <RotateCcw className="mr-1 h-3 w-3" /> Re-run
              </>
            ) : (
              <>
                <Play className="mr-1 h-3 w-3" /> Simulate
              </>
            )}
          </Button>
        )}
      </div>

      {/* Loading */}
      {state === "running" && (
        <div className="flex items-center justify-center py-8">
          <Loader size="md" label="Simulating gameplay..." />
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
            onClick={handleRun}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Idle */}
      {state === "idle" && (
        <p className="text-sm text-slate-400 py-4">
          Run a simulation to analyze gameplay balance, engagement, and
          progression.
        </p>
      )}

      {/* Success */}
      {state === "success" && result && (
        <div className="space-y-4">
          {/* Grade + completion */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-bold">
              <Badge variant={gradeVariant(result.feedback.grade)}>
                {result.feedback.grade}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-slate-400">Overall Grade</p>
              <p className="text-white font-medium">
                {result.simulation.completed
                  ? "Loop Completed"
                  : "Loop Incomplete"}{" "}
                • {result.simulation.ticks} ticks
              </p>
            </div>
          </div>

          {/* Regenerate warning */}
          {result.feedback.shouldRegenerate && (
            <div className="flex items-center gap-2 rounded-xl border border-warning-500/20 bg-warning-500/5 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-warning-400" />
              <p className="text-xs text-warning-400">
                Simulation recommends regeneration — significant gameplay issues
                detected.
              </p>
            </div>
          )}

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Engagement</p>
              <p className="text-lg font-semibold text-white">
                {result.report.engagementScore}
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-brand-500"
                  style={{
                    width: `${result.report.engagementScore}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Completion</p>
              <p className="text-lg font-semibold text-white">
                {Math.round(result.metrics.completionRate * 100)}%
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-success-400"
                  style={{
                    width: `${result.metrics.completionRate * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Economy</p>
              <p className="text-lg font-semibold text-white">
                {result.metrics.economyStability}/100
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-brand-400"
                  style={{
                    width: `${result.metrics.economyStability}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">Session</p>
              <p className="text-lg font-semibold text-white">
                {result.metrics.sessionLength} ticks
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {result.metrics.totalEvents} events
              </p>
            </div>
          </div>

          {/* Issues + Suggestions */}
          {result.report.suggestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">
                Suggestions ({result.report.issues} issues found)
              </p>
              <div className="space-y-1.5">
                {result.report.suggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                  >
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-400" />
                    <p className="text-xs text-slate-300">{suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
