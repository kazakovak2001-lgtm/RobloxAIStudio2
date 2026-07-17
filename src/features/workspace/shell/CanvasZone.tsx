/**
 * workspace/shell/CanvasZone.tsx
 * Central canvas area with mode-based content switching.
 * Renders production panels based on activeCanvasMode.
 */
import { memo, lazy, Suspense } from "react";
import { useWorkspace } from "../core";
import type { CanvasMode } from "../core";
import { CanvasModeSwitcher } from "./CanvasModeSwitcher";
import { Loader } from "@/shared/ui/Loader";
import type { PipelineData } from "./types";

const BuildCanvas = lazy(() => import("./canvas/BuildCanvas"));
const PipelineCanvas = lazy(() => import("./canvas/PipelineCanvas"));
const SimulationCanvas = lazy(() => import("./canvas/SimulationCanvas"));
const PlaytestCanvas = lazy(() => import("./canvas/PlaytestCanvas"));
const CodeCanvas = lazy(() => import("./canvas/CodeCanvas"));
const AnalyticsCanvas = lazy(() => import("./canvas/AnalyticsCanvas"));

interface CanvasZoneProps {
  pipelineData?: PipelineData;
}

function CanvasContent({
  mode,
  pipelineData,
}: {
  mode: CanvasMode;
  pipelineData?: PipelineData;
}) {
  switch (mode) {
    case "build":
      return <BuildCanvas />;
    case "pipeline":
      return <PipelineCanvas pipelineData={pipelineData} />;
    case "simulation":
      return <SimulationCanvas projectId={pipelineData?.projectId ?? ""} />;
    case "playtest":
      return <PlaytestCanvas projectId={pipelineData?.projectId ?? ""} />;
    case "code":
      return <CodeCanvas pipelineId={pipelineData?.pipelineId ?? null} />;
    case "analytics":
      return <AnalyticsCanvas pipelineData={pipelineData} />;
  }
}

export const CanvasZone = memo(function CanvasZone({
  pipelineData,
}: CanvasZoneProps) {
  const { state, setCanvasMode } = useWorkspace();
  const { activeCanvasMode } = state;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-950">
      <CanvasModeSwitcher
        activeMode={activeCanvasMode}
        onModeChange={setCanvasMode}
      />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<CanvasLoader />}>
          <CanvasContent mode={activeCanvasMode} pipelineData={pipelineData} />
        </Suspense>
      </div>
    </div>
  );
});

function CanvasLoader() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Loader label="Loading..." size="md" />
    </div>
  );
}
