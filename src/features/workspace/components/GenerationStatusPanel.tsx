import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Circle,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  Pause,
  Play,
  RotateCcw,
  Ban,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  getExperienceStatus,
  pausePipeline,
  resumePipeline,
  cancelPipeline,
  retryPipeline,
  retryStage,
  type PipelineStatus,
  type PipelineStageStatus,
} from "@/services/conceptApi";

interface GenerationStatusPanelProps {
  pipelineId: string | null;
  onCompleted?: () => void;
  onFailed?: (error: string) => void;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 300_000; // 5 minute max polling time

export function GenerationStatusPanel({
  pipelineId,
  onCompleted,
  onFailed,
}: GenerationStatusPanelProps) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const pollStartRef = useRef<number>(0);

  useEffect(() => {
    if (!pipelineId) {
      setStatus(null);
      setError(null);
      return;
    }

    pollStartRef.current = Date.now();

    const poll = async () => {
      // Timeout guard
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setError("Polling timeout — pipeline may still be running on server");
        stopPolling();
        return;
      }

      try {
        const result = await getExperienceStatus(pipelineId);
        if (result.success && result.data) {
          // Validate response shape before using
          if (!result.data.status || !Array.isArray(result.data.stages)) {
            setError("Invalid pipeline status response");
            return;
          }
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
          } else if (
            result.data.status === "cancelled" ||
            result.data.status === "paused"
          ) {
            stopPolling();
          }
        } else {
          setError(result.error ?? "Failed to fetch status");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Polling error");
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

  const startPolling = () => {
    if (!pipelineId) return;
    const poll = async () => {
      const result = await getExperienceStatus(pipelineId);
      if (result.success && result.data) {
        setStatus(result.data);
        if (
          result.data.status === "completed" ||
          result.data.status === "failed" ||
          result.data.status === "cancelled"
        ) {
          stopPolling();
        }
      }
    };
    poll();
    intervalRef.current = window.setInterval(poll, POLL_INTERVAL_MS);
  };

  const handlePause = async () => {
    if (!pipelineId) return;
    setIsActionLoading(true);
    await pausePipeline(pipelineId);
    setIsActionLoading(false);
    // Refresh immediately
    const result = await getExperienceStatus(pipelineId);
    if (result.success && result.data) setStatus(result.data);
  };

  const handleResume = async () => {
    if (!pipelineId) return;
    setIsActionLoading(true);
    await resumePipeline(pipelineId);
    setIsActionLoading(false);
    startPolling();
  };

  const handleCancel = async () => {
    if (!pipelineId) return;
    setIsActionLoading(true);
    await cancelPipeline(pipelineId);
    setIsActionLoading(false);
    const result = await getExperienceStatus(pipelineId);
    if (result.success && result.data) setStatus(result.data);
  };

  const handleRetry = async () => {
    if (!pipelineId) return;
    setIsActionLoading(true);
    await retryPipeline(pipelineId);
    setIsActionLoading(false);
    startPolling();
  };

  const handleRetryStage = async (stageName: string) => {
    if (!pipelineId) return;
    setIsActionLoading(true);
    await retryStage(pipelineId, stageName);
    setIsActionLoading(false);
    startPolling();
  };

  if (!pipelineId && !status) {
    return null;
  }

  const pipelineStatus = status?.status ?? "pending";
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
        <StatusBadge status={pipelineStatus} />
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
              pipelineStatus === "failed"
                ? "bg-error-500"
                : pipelineStatus === "completed"
                  ? "bg-success-500"
                  : pipelineStatus === "paused"
                    ? "bg-warning-500"
                    : pipelineStatus === "cancelled"
                      ? "bg-slate-500"
                      : "bg-brand-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Control buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        {pipelineStatus === "running" && (
          <>
            <ControlButton
              icon={Pause}
              label="Pause"
              onClick={handlePause}
              disabled={isActionLoading}
              color="text-warning-400 bg-warning-500/10 hover:bg-warning-500/20"
            />
            <ControlButton
              icon={Ban}
              label="Cancel"
              onClick={handleCancel}
              disabled={isActionLoading}
              color="text-error-400 bg-error-500/10 hover:bg-error-500/20"
            />
          </>
        )}
        {pipelineStatus === "paused" && (
          <>
            <ControlButton
              icon={Play}
              label="Resume"
              onClick={handleResume}
              disabled={isActionLoading}
              color="text-success-400 bg-success-500/10 hover:bg-success-500/20"
            />
            <ControlButton
              icon={Ban}
              label="Cancel"
              onClick={handleCancel}
              disabled={isActionLoading}
              color="text-error-400 bg-error-500/10 hover:bg-error-500/20"
            />
          </>
        )}
        {pipelineStatus === "failed" && (
          <ControlButton
            icon={RotateCcw}
            label="Retry Failed"
            onClick={handleRetry}
            disabled={isActionLoading}
            color="text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20"
          />
        )}
      </div>

      {/* Stage list (timeline) */}
      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {status?.stages.map((stage) => (
          <StageRow
            key={stage.name}
            stage={stage}
            isExpanded={expandedStage === stage.name}
            onToggle={() =>
              setExpandedStage(expandedStage === stage.name ? null : stage.name)
            }
            onRetry={
              stage.status === "failed"
                ? () => handleRetryStage(stage.name)
                : undefined
            }
            isActionLoading={isActionLoading}
          />
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
          <p className="text-error-400">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {failedStage.error ?? `Failed at ${failedStage.name}`}
          </p>
        )}
        {error && <p className="text-error-400">{error}</p>}
      </div>
    </Card>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  color,
}: {
  icon: typeof Pause;
  label: string;
  onClick: () => void;
  disabled: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${color}`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function StageRow({
  stage,
  isExpanded,
  onToggle,
  onRetry,
  isActionLoading,
}: {
  stage: PipelineStageStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onRetry?: () => void;
  isActionLoading: boolean;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5"
      >
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
          {stage.durationMs !== undefined && (
            <span className="text-slate-600">
              {(stage.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3 w-3 text-slate-500" />
          ) : (
            <ChevronDown className="h-3 w-3 text-slate-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="ml-6 mt-1 mb-1 space-y-1 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
          <p className="text-slate-400">
            Agent:{" "}
            <span className="text-slate-300">{stage.agentId ?? "none"}</span>
          </p>
          <p className="text-slate-400">
            Status: <span className="text-slate-300">{stage.status}</span>
          </p>
          {stage.startedAt && (
            <p className="text-slate-400">
              Started:{" "}
              <span className="text-slate-300">
                {new Date(stage.startedAt).toLocaleTimeString()}
              </span>
            </p>
          )}
          {stage.durationMs !== undefined && (
            <p className="text-slate-400">
              Duration:{" "}
              <span className="text-slate-300">
                {(stage.durationMs / 1000).toFixed(2)}s
              </span>
            </p>
          )}
          {stage.error && (
            <p className="text-error-400">Error: {stage.error}</p>
          )}
          {onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              disabled={isActionLoading}
              className="mt-1 flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40"
            >
              <RotateCcw className="h-2.5 w-2.5" /> Retry this stage
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StageIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-3.5 w-3.5 text-success-400" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-error-400" />;
    case "skipped":
      return <Circle className="h-3.5 w-3.5 text-warning-400" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-slate-600" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "text-slate-400 bg-slate-500/10",
    running: "text-cyan-400 bg-cyan-500/10",
    completed: "text-success-400 bg-success-500/10",
    failed: "text-error-400 bg-error-500/10",
    recovering: "text-warning-400 bg-warning-500/10",
    paused: "text-warning-400 bg-warning-500/10",
    cancelled: "text-slate-400 bg-slate-500/10",
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
