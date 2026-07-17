/**
 * workspace/shell/PropertiesZone.tsx
 * Context-aware right panel displaying relevant panels
 * based on current phase, canvas mode, and user selection.
 *
 * Priority: selection > canvas-mode > workflow-phase
 */
import { memo, lazy, Suspense } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useWorkspace } from "../core";
import { Loader } from "@/shared/ui/Loader";
import type { PipelineData } from "./types";

// Lazy-load property panel content
const PipelineProperties = lazy(
  () => import("./properties/PipelineProperties"),
);
const BuildProperties = lazy(() => import("./properties/BuildProperties"));
const ExportProperties = lazy(() => import("./properties/ExportProperties"));
const DefaultProperties = lazy(() => import("./properties/DefaultProperties"));
const ValidationProperties = lazy(
  () => import("./properties/ValidationProperties"),
);
const MonitoringProperties = lazy(
  () => import("./properties/MonitoringProperties"),
);

interface PropertiesZoneProps {
  pipelineData?: PipelineData;
}

export const PropertiesZone = memo(function PropertiesZone({
  pipelineData,
}: PropertiesZoneProps) {
  const { state, setZoneState } = useWorkspace();
  const { collapsed } = state.zones.properties;
  const { propertiesContext, activeCanvasMode, currentPhase } = state;

  const toggleCollapse = () => {
    setZoneState("properties", { collapsed: !collapsed });
  };

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center border-l border-white/10 bg-slate-900/70 py-3 transition-all duration-200 ease-out">
        <button
          type="button"
          onClick={toggleCollapse}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Expand properties panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Determine which properties content to render based on priority system
  const renderContent = () => {
    // Priority 1: Explicit selection context
    if (
      propertiesContext.source === "selection" &&
      propertiesContext.selectedEntity
    ) {
      const { type } = propertiesContext.selectedEntity;
      if (type === "agent" || type === "pipeline-phase") {
        return <PipelineProperties pipelineData={pipelineData} />;
      }
    }

    // Priority 2: Active canvas mode
    switch (activeCanvasMode) {
      case "pipeline":
        return <PipelineProperties pipelineData={pipelineData} />;
      case "build":
        return <BuildProperties />;
      case "code":
        return <ExportProperties pipelineData={pipelineData} />;
      case "playtest":
        return <ValidationProperties pipelineData={pipelineData} />;
      case "simulation":
      case "analytics":
        return <MonitoringProperties pipelineData={pipelineData} />;
      default:
        break;
    }

    // Priority 3: Workflow phase
    if (currentPhase === "export") {
      return <ExportProperties pipelineData={pipelineData} />;
    }
    if (currentPhase === "validation") {
      return <ValidationProperties pipelineData={pipelineData} />;
    }
    if (currentPhase === "generation" || currentPhase === "planning") {
      return <PipelineProperties pipelineData={pipelineData} />;
    }

    return <DefaultProperties pipelineData={pipelineData} />;
  };

  return (
    <div className="relative flex h-full flex-col border-l border-white/10 bg-slate-900/70 transition-all duration-200 ease-out overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Properties
        </span>
        <button
          type="button"
          onClick={toggleCollapse}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Collapse properties panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<PropertiesLoader />}>{renderContent()}</Suspense>
      </div>

      {/* Resize handle */}
      <div className="absolute inset-y-0 left-0 w-1 cursor-col-resize bg-transparent transition hover:bg-brand-400/50" />
    </div>
  );
});

function PropertiesLoader() {
  return (
    <div className="flex items-center justify-center p-6">
      <Loader label="Loading..." size="sm" />
    </div>
  );
}
