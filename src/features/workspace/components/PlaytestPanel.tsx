import { useState, useCallback } from "react";
import { Card } from "@/shared/ui/Card";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Loader } from "@/shared/ui/Loader";
import { Shield, CheckCircle, RotateCcw } from "lucide-react";
import { runPlaytest, type PlaytestReport } from "@/services/playtestApi";

interface PlaytestPanelProps {
  projectId: string;
}

export function PlaytestPanel({ projectId }: PlaytestPanelProps) {
  const [state, setState] = useState<"idle" | "running" | "success" | "error">(
    "idle",
  );
  const [report, setReport] = useState<PlaytestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classificationVariant = (c: string) => {
    switch (c) {
      case "production_ready":
        return "success" as const;
      case "needs_work":
        return "warning" as const;
      default:
        return "danger" as const;
    }
  };

  const severityVariant = (s: string) => {
    switch (s) {
      case "critical":
        return "danger" as const;
      case "warning":
        return "warning" as const;
      default:
        return "default" as const;
    }
  };

  const handleRun = useCallback(async () => {
    setState("running");
    setError(null);

    // Construct mock scripts/assets for the playtest (in real flow, these come from pipeline artifacts)
    const input = {
      projectId,
      scripts: [
        {
          name: "GameManager.lua",
          type: "server",
          path: "ServerScriptService/GameManager",
          content:
            "local Players = game:GetService('Players')\nlocal ReplicatedStorage = game:GetService('ReplicatedStorage')\n\nlocal function onPlayerAdded(player)\n  pcall(function() end)\nend\n\nPlayers.PlayerAdded:Connect(onPlayerAdded)",
          dependencies: ["ReplicatedStorage"],
        },
        {
          name: "InventorySystem.lua",
          type: "module",
          path: "ReplicatedStorage/Modules/Inventory",
          content:
            "--[[ Inventory Module ]]\nlocal Inventory = {}\nfunction Inventory.new(player)\n  return { items = {}, capacity = 20 }\nend\nreturn Inventory",
          dependencies: [],
        },
        {
          name: "UIController.lua",
          type: "client",
          path: "StarterPlayerScripts/UIController",
          content:
            "local ReplicatedStorage = game:GetService('ReplicatedStorage')\nlocal RemoteEvent = ReplicatedStorage:WaitForChild('GameEvent')\n\nRemoteEvent.OnClientEvent:Connect(function(data) end)",
          dependencies: ["ReplicatedStorage"],
        },
      ],
      assets: [
        {
          name: "sword_mesh",
          type: "mesh",
          targetService: "ReplicatedStorage",
          placeholder: false,
        },
        {
          name: "coin_particle",
          type: "particle",
          targetService: "ReplicatedStorage",
          placeholder: true,
        },
      ],
    };

    const res = await runPlaytest(input);
    if (res.success && res.data) {
      setReport(res.data);
      setState("success");
    } else {
      setError(res.error ?? "Playtest failed");
      setState("error");
    }
  }, [projectId]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Quality Playtest</h3>
        {state !== "running" && (
          <Button
            variant={state === "success" ? "secondary" : "primary"}
            size="sm"
            onClick={handleRun}
          >
            {state === "success" ? (
              <>
                <RotateCcw className="mr-1 h-3 w-3" /> Re-test
              </>
            ) : (
              <>
                <Shield className="mr-1 h-3 w-3" /> Run Test
              </>
            )}
          </Button>
        )}
      </div>

      {state === "running" && (
        <div className="flex items-center justify-center py-8">
          <Loader size="md" label="Running quality playtest..." />
        </div>
      )}

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

      {state === "idle" && (
        <p className="text-sm text-slate-400 py-4">
          Validate generated code quality, performance, and Roblox
          compatibility.
        </p>
      )}

      {state === "success" && report && (
        <div className="space-y-4">
          {/* Score + Classification */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-bold text-white">
              {report.overallScore}
            </div>
            <div>
              <Badge variant={classificationVariant(report.classification)}>
                {report.classification.replace(/_/g, " ")}
              </Badge>
              <p className="mt-1 text-xs text-slate-400">{report.summary}</p>
            </div>
          </div>

          {/* Category Scores */}
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(report.scores).map(([cat, score]) => (
              <div
                key={cat}
                className="rounded-lg border border-white/5 bg-slate-950/50 p-2 text-center"
              >
                <p className="text-xs text-slate-400 capitalize">{cat}</p>
                <p className="text-sm font-semibold text-white">{score}</p>
                <div className="mt-1 h-1 w-full rounded-full bg-white/10">
                  <div
                    className={`h-1 rounded-full ${score >= 80 ? "bg-success-400" : score >= 50 ? "bg-warning-400" : "bg-error-400"}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Performance */}
          <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
            <p className="text-xs text-slate-400 mb-2">Performance Estimate</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">
                Init time: ~{report.performance.estimatedInitTimeMs}ms
              </span>
              <span className="text-slate-500">
                {report.performance.scriptCount} scripts •{" "}
                {report.performance.assetCount} assets
              </span>
            </div>
            {report.performance.riskAreas.length > 0 && (
              <div className="mt-2 space-y-1">
                {report.performance.riskAreas.map((risk, i) => (
                  <p key={i} className="text-xs text-warning-400">
                    ⚠ {risk}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Issues (top 5) */}
          {report.issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">
                Issues ({report.issues.length})
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {report.issues.slice(0, 5).map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                  >
                    <Badge variant={severityVariant(issue.severity)}>
                      {issue.severity}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 truncate">
                        {issue.reason}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        Fix: {issue.recommendedFix}
                      </p>
                    </div>
                  </div>
                ))}
                {report.issues.length > 5 && (
                  <p className="text-xs text-slate-500 text-center">
                    +{report.issues.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Production Ready indicator */}
          {report.classification === "production_ready" && (
            <div className="flex items-center gap-2 rounded-xl border border-success-500/20 bg-success-500/5 px-3 py-2">
              <CheckCircle className="h-4 w-4 text-success-400" />
              <p className="text-xs text-success-400">
                Experience is production ready for Roblox Studio export.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
