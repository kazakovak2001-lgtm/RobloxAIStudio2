/**
 * workspace/shell/AICommandZone.tsx
 * Persistent bottom panel: AI operations, console, activity, generation controls.
 */
import { memo, lazy, Suspense, useCallback, useState } from "react";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { useWorkspace } from "../core";
import { useToast } from "@/shared/ui/Toast";
import { GenerateButton } from "../components/GenerateButton";
import { useResizeHandle } from "./hooks/useResizeHandle";
import type { PipelineData } from "./types";

// Lazy-load heavy content panels
const ConsoleTab = lazy(() => import("./ai-command/ConsoleTab"));
const ActivityTab = lazy(() => import("./ai-command/ActivityTab"));
const StatusHeader = lazy(() => import("./ai-command/StatusHeader"));

const HEIGHT_MAP = {
  collapsed: 44,
  default: 240,
  expanded: "40vh",
} as const;

interface AICommandZoneProps {
  pipelineData?: PipelineData;
}

export const AICommandZone = memo(function AICommandZone({
  pipelineData,
}: AICommandZoneProps) {
  const { state, setAICommandState } = useWorkspace();
  const { toast } = useToast();
  const { aiCommandState } = state;
  const { height, activeTab, draftPrompt } = aiCommandState;

  const currentHeight = HEIGHT_MAP[height];

  const [customHeight, setCustomHeight] = useState<number | null>(null);

  const { onMouseDown: handleResizeMouseDown } = useResizeHandle({
    direction: "vertical",
    min: 100,
    max: Math.round(
      typeof window !== "undefined" ? window.innerHeight * 0.6 : 600,
    ),
    onResize: (size) => {
      setCustomHeight(size);
      if (size <= 60) setAICommandState({ height: "collapsed" });
      else if (size < 280) setAICommandState({ height: "default" });
      else setAICommandState({ height: "expanded" });
    },
  });

  const cycleHeight = () => {
    setCustomHeight(null);
    if (height === "collapsed") setAICommandState({ height: "default" });
    else if (height === "default") setAICommandState({ height: "expanded" });
    else setAICommandState({ height: "collapsed" });
  };

  const collapse = () => {
    setCustomHeight(null);
    setAICommandState({ height: "collapsed" });
  };

  const handleStarted = useCallback(
    (execId: string) => {
      pipelineData?.onPipelineStarted?.(execId);
      toast({
        variant: "info",
        title: "Generation started",
        description: `Execution: ${execId}`,
      });
    },
    [toast, pipelineData],
  );

  const handleError = useCallback(
    (err: string) => {
      toast({
        variant: "error",
        title: "Generation failed",
        description: err,
      });
    },
    [toast],
  );

  const projectId = pipelineData?.projectId ?? "";
  const pipelineStatus = pipelineData?.status ?? "idle";
  const logs = pipelineData?.logs ?? [];
  const events = pipelineData?.events ?? [];
  const pipeline = pipelineData?.pipeline ?? null;

  return (
    <div
      className="flex flex-col border-t border-white/10 bg-slate-900/70 transition-all duration-200 ease-out overflow-hidden"
      style={{
        height:
          customHeight !== null && height !== "collapsed"
            ? `${customHeight}px`
            : typeof currentHeight === "number"
              ? `${currentHeight}px`
              : currentHeight,
      }}
    >
      {/* Resize handle */}
      <div
        className="h-1 w-full cursor-row-resize bg-transparent transition hover:bg-brand-400/50 active:bg-brand-400"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Header bar with tabs + status + controls */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAICommandState({ activeTab: "console" })}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              activeTab === "console"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Console
          </button>
          <button
            type="button"
            onClick={() => setAICommandState({ activeTab: "activity" })}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              activeTab === "activity"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Activity
          </button>

          {/* Inline status indicator */}
          <div className="ml-3 flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                pipelineData?.isConnected ? "bg-success-400" : "bg-slate-500"
              }`}
            />
            <span className="text-xs text-slate-500">
              {String(pipelineStatus)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cycleHeight}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Toggle panel height"
          >
            {height === "expanded" ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={collapse}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Collapse AI command panel"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content area — only visible when not collapsed */}
      {height !== "collapsed" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Status header with PipelineStatusBar */}
          <Suspense fallback={null}>
            <StatusHeader pipeline={pipeline} status={pipelineStatus} />
          </Suspense>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            <Suspense
              fallback={
                <div className="p-3 text-xs text-slate-500">Loading...</div>
              }
            >
              {activeTab === "console" ? (
                <ConsoleTab logs={logs} />
              ) : (
                <ActivityTab events={events} />
              )}
            </Suspense>
          </div>

          {/* Prompt + Generate controls */}
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2">
              <textarea
                className="flex-1 resize-none rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/25"
                placeholder="Describe your game idea..."
                rows={1}
                value={draftPrompt}
                onChange={(e) =>
                  setAICommandState({ draftPrompt: e.target.value })
                }
              />
              <div className="shrink-0">
                <GenerateButton
                  projectId={projectId}
                  pipelineStatus={String(pipelineStatus)}
                  onStarted={handleStarted}
                  onError={handleError}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed: show single-line prompt */}
      {height === "collapsed" && (
        <div className="flex flex-1 items-center gap-2 px-4">
          <div
            className={`h-2 w-2 shrink-0 rounded-full ${
              pipelineData?.isConnected ? "bg-success-400" : "bg-slate-500"
            }`}
          />
          <input
            type="text"
            className="flex-1 rounded-lg border border-white/10 bg-slate-800/50 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-brand-400/50"
            placeholder="AI command..."
            value={draftPrompt}
            onChange={(e) => setAICommandState({ draftPrompt: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setAICommandState({ height: "default" })}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Expand AI command panel"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
});
