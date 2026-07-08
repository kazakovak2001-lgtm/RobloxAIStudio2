import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Circle,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Card } from "../../../components/ui/Card";
import {
  getExperienceStatus,
  type PipelineStatus,
  type PipelineStageStatus,
} from "../../../services/conceptApi";

interface GenerationStatusPanelProps {
  pipelineId: string | null;
  onCompleted?: () => void;
  onFailed?: (error: string) => void;
}

const POLL_INTERVAL_MS = 3000;

export function GenerationStatusPanel({
  pipelineId,
  onCompleted,
  onFailed,
}: GenerationStatusPanelProps) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pipelineId) {
      setStatus(null);
      setError(null);
      return;
    }

    const poll = async () => {
      const result = await getExperienceStatus(pipelineId);
      if (result.success && result.data) {
        setStatus(result.data);
        setError(null);

        if (result.data.status === "completed") {
          onCompleted?.();
          stopPolling();
        } else if (result.data.status === "failed") {
          const failedStage = result.data.stages.find(
            (s) => s.status === "failed",
          );
          const errMsg =
            failedStage?.error ?? "Pipeline failed at unknown stage";
          onFailed?.(errMsg);
          stopPolling();
        }
      } else {
        setError(result.error ?? "Failed to fetch status");
      }
    };

    poll();
    intervalRef.current = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [pipelineId]);

  const stopPolling = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  if (!pipelineId && !status) {
    return null;
  }

  const completedCount = status?.completedStages.length ?? 0;
  const totalCount = status?.stages.length ?? 0;
  const progressPct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentStage = status?.stages.find((s) => s.status === "running");
  const failedStage = status?.stages.find((s) => s.status === "failed");
  const elapsed = status?.startedAt
    ? Math.round(((status.finishedAt ?? Date.now()) - status.startedAt) / 1000)
    : 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Generation Progress</p>
        <StatusBadge status={status?.status ?? "pending"} />
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {completedCount}/{totalCount} stages
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status?.status === "failed"
                ? "bg-red-500"
                : status?.status === "completed"
                  ? "bg-green-500"
                  : "bg-brand-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stage list */}
      <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
        {status?.stages.map((stage) => (
          <StageRow key={stage.name} stage={stage} />
        ))}
      </div>

      {/* Footer info */}
      <div className="mt-3 border-t border-white/5 pt-2 text-xs text-slate-400 space-y-1">
        {elapsed > 0 && (
          <p className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {elapsed}s elapsed
          </p>
        )}
        {currentStage && (
          <p>Active agent: {currentStage.agentId ?? currentStage.name}</p>
        )}
        {failedStage && (
          <p className="text-red-400">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {failedStage.error ?? `Failed at ${failedStage.name}`}
          </p>
        )}
        {error && <p className="text-red-400">{error}</p>}
      </div>
    </Card>
  );
}

function StageRow({ stage }: { stage: PipelineStageStatus }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <StageIcon status={stage.status} />
        <span
          className={
            stage.status === "completed"
              ? "text-green-300"
              : stage.status === "running"
                ? "text-cyan-300"
                : stage.status === "failed"
                  ? "text-red-300"
                  : "text-slate-500"
          }
        >
          {formatStageName(stage.name)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {stage.agentId && (
          <span className="text-slate-600">{stage.agentId}</span>
        )}
        {stage.durationMs !== undefined && (
          <span className="text-slate-600">
            {(stage.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
}

function StageIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-3.5 w-3.5 text-green-400" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    case "skipped":
      return <Circle className="h-3.5 w-3.5 text-yellow-400" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-slate-600" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "text-slate-400 bg-slate-500/10",
    running: "text-cyan-400 bg-cyan-500/10",
    completed: "text-green-400 bg-green-500/10",
    failed: "text-red-400 bg-red-500/10",
    recovering: "text-yellow-400 bg-yellow-500/10",
  };
  const color = colors[status] ?? colors.pending;

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status.toUpperCase()}
    </span>
  );
}

function formatStageName(name: string): string {
  return name
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
