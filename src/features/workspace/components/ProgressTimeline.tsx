import { memo, useMemo } from "react";
import {
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import type { PipelineState } from "../types";

interface ProgressTimelineProps {
  pipeline: PipelineState | null;
}

const defaultSteps = [
  { label: "Requirements", agent: "Planner" },
  { label: "Planning", agent: "Designer" },
  { label: "Architecture", agent: "Architect" },
  { label: "Lua", agent: "Lua Generator" },
  { label: "GUI", agent: "UI Generator" },
  { label: "QA", agent: "QA Agent" },
  { label: "Export", agent: "QA Agent" },
];

const statusIconMap: Record<string, JSX.Element> = {
  running: <LoaderCircle className="h-4 w-4 animate-spin text-amber-300" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-300" />,
  failed: <TriangleAlert className="h-4 w-4 text-rose-300" />,
  idle: <CircleDashed className="h-4 w-4 text-slate-500" />,
  retrying: <LoaderCircle className="h-4 w-4 animate-spin text-amber-300" />,
  paused: <CircleDashed className="h-4 w-4 text-cyan-300" />,
  cancelled: <CircleDashed className="h-4 w-4 text-slate-500" />,
};

function ProgressTimelineComponent({ pipeline }: ProgressTimelineProps) {
  const steps = useMemo(() => {
    if (!pipeline)
      return defaultSteps.map((step) => ({
        ...step,
        status: "idle" as const,
        duration: "—",
        progress: 0,
      }));

    return defaultSteps.map((step) => {
      const agent = pipeline.agents.find((item) =>
        item.name.toLowerCase().includes(step.agent.toLowerCase()),
      );
      const status = agent?.status ?? "idle";
      const duration =
        agent?.finishedAt && agent?.startedAt
          ? `${Math.round((agent.finishedAt.getTime() - agent.startedAt.getTime()) / 1000)}s`
          : agent?.status === "running"
            ? "live"
            : "—";

      return { ...step, status, duration, progress: agent?.progress ?? 0 };
    });
  }, [pipeline]);

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              Pipeline timeline
            </p>
            <p className="text-xs text-slate-500">
              Ordered execution flow for the Roblox build pipeline.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {pipeline?.progress ?? 0}%
          </div>
        </div>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className="rounded-2xl border border-white/10 bg-slate-950/60 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  {statusIconMap[step.status] ?? statusIconMap.idle}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-200">
                      {step.label}
                    </p>
                    <span className="text-xs text-slate-500">
                      {step.duration}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-brand-400 transition-all duration-500"
                      style={{ width: `${step.progress}%` }}
                    />
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="ml-4 mt-3 h-3 w-px bg-gradient-to-b from-white/20 to-transparent" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

export const ProgressTimeline = memo(ProgressTimelineComponent);
export default ProgressTimeline;
