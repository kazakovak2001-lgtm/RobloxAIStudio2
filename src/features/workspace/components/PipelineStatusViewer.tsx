import { Card } from "@/shared/ui/Card";
import { CheckCircle, Circle, XCircle, Loader2 } from "lucide-react";
import type { PipelineState, WorkspaceStatus } from "../types";

interface PipelineStatusViewerProps {
  pipeline: PipelineState | null;
  status: WorkspaceStatus;
}

const STAGES = [
  "Planner",
  "Designer",
  "Architect",
  "Builder",
  "Validator",
  "Optimizer",
];

export function PipelineStatusViewer({
  pipeline,
  status,
}: PipelineStatusViewerProps) {
  const completedAgents =
    pipeline?.agents.filter((a) => a.status === "completed") ?? [];
  const runningAgent = pipeline?.agents.find((a) => a.status === "running");
  const failedAgent = pipeline?.agents.find((a) => a.status === "failed");

  const elapsed = pipeline?.startedAt
    ? Math.round((Date.now() - pipeline.startedAt.getTime()) / 1000)
    : 0;
  const completed = pipeline?.finishedAt
    ? new Date(pipeline.finishedAt).toLocaleTimeString()
    : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Pipeline Status</p>
        <span
          className={`text-xs ${status === "completed" ? "text-green-400" : status === "failed" ? "text-red-400" : status === "running" ? "text-cyan-400" : "text-slate-400"}`}
        >
          {status.toUpperCase()}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {STAGES.map((stage) => {
          const agent = pipeline?.agents.find((a) => a.name === stage);
          const isComplete = agent?.status === "completed";
          const isRunning = agent?.status === "running";
          const isFailed = agent?.status === "failed";

          return (
            <div
              key={stage}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                {isComplete && (
                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                )}
                {isRunning && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                )}
                {isFailed && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                {!agent && <Circle className="h-3.5 w-3.5 text-slate-600" />}
                <span
                  className={
                    isComplete
                      ? "text-green-300"
                      : isRunning
                        ? "text-cyan-300"
                        : isFailed
                          ? "text-red-300"
                          : "text-slate-500"
                  }
                >
                  {stage}
                </span>
              </div>
              {agent?.progress !== undefined && (
                <span className="text-slate-500">{agent.progress}%</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-white/5 pt-2 text-xs text-slate-400 space-y-1">
        {elapsed > 0 && <p>Elapsed: {elapsed}s</p>}
        {completed && <p>Completed: {completed}</p>}
        {runningAgent && <p>Active: {runningAgent.name}</p>}
        {failedAgent && (
          <p className="text-red-400">Failed: {failedAgent.name}</p>
        )}
        <p>
          Steps: {completedAgents.length}/{STAGES.length}
        </p>
      </div>
    </Card>
  );
}
