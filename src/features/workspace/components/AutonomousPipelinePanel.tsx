import { useState, useCallback, useEffect, useRef } from "react";
import { Card } from "@/shared/ui/Card";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import {
  Play,
  Pause,
  XCircle,
  RotateCcw,
  CheckCircle,
  Circle,
  Loader2,
  SkipForward,
  AlertTriangle,
} from "lucide-react";
import {
  startAutonomousRun,
  getAutonomousStatus,
  pauseAutonomous,
  resumeAutonomous,
  cancelAutonomous,
  type OrchestratorSession,
  type ExecutionNode,
} from "@/services/autonomousApi";
import { usePipelineStream } from "../hooks/usePipelineStream";

interface AutonomousPipelinePanelProps {
  projectId: string;
}

const PHASE_LABELS: Record<string, string> = {
  genre_detection: "Genre Detection",
  knowledge_search: "Knowledge Search",
  blueprint: "Blueprint",
  agent_collaboration: "Agent Collaboration",
  lua_generation: "Lua Generation",
  asset_generation: "Asset Generation",
  experience_assembly: "Experience Assembly",
  playtest: "Playtest",
  repair: "Repair",
  benchmark: "Benchmark",
  studio_sync: "Studio Sync",
  completed: "Completed",
};

export function AutonomousPipelinePanel({
  projectId,
}: AutonomousPipelinePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<OrchestratorSession | null>(null);
  const [state, setState] = useState<
    "idle" | "running" | "paused" | "completed" | "failed" | "cancelled"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef<number>(0);

  // Socket.IO primary transport — reuse existing usePipelineStream hook
  const { isConnected } = usePipelineStream(projectId);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (sid: string) => {
      stopPolling();
      // When Socket.IO is connected, reduce polling to 10s (gap-filling only)
      // When disconnected, poll at 2s (current behavior)
      const interval = isConnected ? 10000 : 2000;
      pollingRef.current = setInterval(async () => {
        const res = await getAutonomousStatus(sid);
        if (!res.success) {
          // Session not found (404) or other error
          if (retryCountRef.current < 1) {
            retryCountRef.current++;
            return; // Will retry on next poll cycle
          }
          // Second failure — session is truly gone
          stopPolling();
          setError("Session expired — start a new run.");
          setState("idle");
          setSessionId(null);
          setSession(null);
          return;
        }
        retryCountRef.current = 0; // Reset on success
        if (res.data) {
          setSession(res.data);
          const s = res.data.status;
          if (
            s === "completed" ||
            s === "failed" ||
            s === "cancelled" ||
            s === "paused"
          ) {
            setState(s);
            stopPolling();
          }
        }
      }, interval);
    },
    [stopPolling, isConnected],
  );

  // Adjust polling interval when Socket.IO connection state changes
  useEffect(() => {
    if (sessionId && state === "running") {
      startPolling(sessionId);
    }
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = useCallback(async () => {
    if (!prompt.trim() || prompt.length < 5) return;
    setError(null);
    setState("running");

    const res = await startAutonomousRun({ prompt: prompt.trim(), projectId });
    if (res.success && res.data) {
      setSessionId(res.data.sessionId);
      startPolling(res.data.sessionId);
      // Fetch initial status
      const statusRes = await getAutonomousStatus(res.data.sessionId);
      if (statusRes.success && statusRes.data) setSession(statusRes.data);
    } else {
      setError(res.error ?? "Failed to start");
      setState("idle");
    }
  }, [prompt, projectId, startPolling]);

  const handlePause = useCallback(async () => {
    if (!sessionId) return;
    await pauseAutonomous(sessionId);
    stopPolling();
    const res = await getAutonomousStatus(sessionId);
    if (res.success && res.data) {
      setSession(res.data);
      setState("paused");
    }
  }, [sessionId, stopPolling]);

  const handleResume = useCallback(async () => {
    if (!sessionId) return;
    await resumeAutonomous(sessionId);
    setState("running");
    startPolling(sessionId);
  }, [sessionId, startPolling]);

  const handleCancel = useCallback(async () => {
    if (!sessionId) return;
    await cancelAutonomous(sessionId);
    stopPolling();
    const res = await getAutonomousStatus(sessionId);
    if (res.success && res.data) {
      setSession(res.data);
      setState("cancelled");
    }
  }, [sessionId, stopPolling]);

  const handleReset = useCallback(() => {
    stopPolling();
    setSession(null);
    setSessionId(null);
    setPrompt("");
    setError(null);
    setState("idle");
    retryCountRef.current = 0;
  }, [stopPolling]);

  const phaseIcon = (node: ExecutionNode) => {
    switch (node.status) {
      case "completed":
        return <CheckCircle className="h-3.5 w-3.5 text-success-400" />;
      case "running":
        return <Loader2 className="h-3.5 w-3.5 text-brand-400 animate-spin" />;
      case "failed":
        return <AlertTriangle className="h-3.5 w-3.5 text-error-400" />;
      case "skipped":
        return <SkipForward className="h-3.5 w-3.5 text-slate-500" />;
      default:
        return <Circle className="h-3.5 w-3.5 text-slate-600" />;
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          Autonomous Pipeline
        </h3>
        {(state === "completed" ||
          state === "failed" ||
          state === "cancelled") && (
          <Button variant="secondary" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1 h-3 w-3" /> New Run
          </Button>
        )}
      </div>

      {/* Idle — prompt input */}
      {state === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Enter a game description for fully autonomous generation.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-brand-400 resize-none"
            rows={3}
            placeholder="Create a mining simulator with pets, rebirths, and a shop system..."
          />
          {error && <p className="text-xs text-error-400">{error}</p>}
          <Button
            variant="primary"
            size="sm"
            onClick={handleStart}
            disabled={prompt.length < 5}
          >
            <Play className="mr-1 h-3 w-3" /> Start Autonomous Run
          </Button>
        </div>
      )}

      {/* Running / Paused — timeline + controls */}
      {(state === "running" || state === "paused") && session && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-2">
            {state === "running" && (
              <>
                <Button variant="secondary" size="sm" onClick={handlePause}>
                  <Pause className="mr-1 h-3 w-3" /> Pause
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCancel}>
                  <XCircle className="mr-1 h-3 w-3" /> Cancel
                </Button>
              </>
            )}
            {state === "paused" && (
              <>
                <Button variant="primary" size="sm" onClick={handleResume}>
                  <Play className="mr-1 h-3 w-3" /> Resume
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCancel}>
                  <XCircle className="mr-1 h-3 w-3" /> Cancel
                </Button>
                <Badge variant="warning">Paused</Badge>
              </>
            )}
          </div>

          {/* Genre + Score */}
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {session.genre && <Badge variant="info">{session.genre}</Badge>}
            <span>Quality: {session.qualityScore}/100</span>
            <span>Cost: ${session.cost.totalCost.toFixed(4)}</span>
          </div>

          {/* Phase Timeline */}
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {session.phases
              .filter(
                (p) =>
                  p.phase !== "completed" &&
                  p.phase !== "failed" &&
                  p.phase !== "paused" &&
                  p.phase !== "cancelled",
              )
              .map((node) => (
                <div
                  key={node.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${node.status === "running" ? "bg-brand-500/10 border border-brand-400/20" : "border border-transparent"}`}
                >
                  {phaseIcon(node)}
                  <span
                    className={`flex-1 ${node.status === "running" ? "text-white font-medium" : node.status === "completed" ? "text-slate-300" : "text-slate-500"}`}
                  >
                    {PHASE_LABELS[node.phase] ?? node.phase}
                  </span>
                  {node.durationMs && (
                    <span className="text-slate-600">{node.durationMs}ms</span>
                  )}
                  {node.skippedReason && (
                    <span
                      className="text-slate-600 truncate max-w-[100px]"
                      title={node.skippedReason}
                    >
                      skipped
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {state === "completed" && session && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-success-400" />
            <div>
              <p className="text-sm font-medium text-white">
                Pipeline Complete
              </p>
              <p className="text-xs text-slate-400">
                Quality: {session.qualityScore}/100 • $
                {session.cost.totalCost.toFixed(4)} •{" "}
                {Math.round(session.cost.totalTimeMs / 1000)}s
              </p>
            </div>
          </div>
          {session.qualityScore >= 80 && (
            <div className="flex items-center gap-2 rounded-xl border border-success-500/20 bg-success-500/5 px-3 py-2">
              <CheckCircle className="h-4 w-4 text-success-400" />
              <p className="text-xs text-success-400">
                Production ready — meets quality target.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Failed */}
      {state === "failed" && session && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-error-400" />
            <div>
              <p className="text-sm font-medium text-error-400">
                Pipeline Failed
              </p>
              <p className="text-xs text-slate-400">
                {session.phases.find((p) => p.status === "failed")?.error ??
                  "Unknown error"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cancelled */}
      {state === "cancelled" && session && (
        <div className="flex items-center gap-3">
          <XCircle className="h-5 w-5 text-slate-400" />
          <p className="text-sm text-slate-400">
            Pipeline cancelled. ${session.cost.totalCost.toFixed(4)} spent.
          </p>
        </div>
      )}
    </Card>
  );
}
