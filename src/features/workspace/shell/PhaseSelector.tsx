import { memo } from "react";
import { Check, Circle } from "lucide-react";
import type { WorkflowPhase } from "../core";
import { WORKFLOW_PHASES } from "../core";

interface PhaseSelectorProps {
  currentPhase: WorkflowPhase;
  completedPhases: WorkflowPhase[];
  onPhaseSelect: (phase: WorkflowPhase) => void;
}

const PHASE_LABELS: Record<WorkflowPhase, string> = {
  generate: "Generate",
  planning: "Planning",
  generation: "Generation",
  validation: "Validation",
  simulation: "Simulation",
  economy: "Economy",
  playtest: "Playtest",
  export: "Export",
};

function getPhaseStatus(
  phase: WorkflowPhase,
  currentPhase: WorkflowPhase,
  completedPhases: WorkflowPhase[],
): "current" | "completed" | "available" | "locked" {
  if (phase === currentPhase) return "current";
  if (completedPhases.includes(phase)) return "completed";

  // Available = next sequential phase after current
  const currentIdx = WORKFLOW_PHASES.indexOf(currentPhase);
  const phaseIdx = WORKFLOW_PHASES.indexOf(phase);
  if (phaseIdx === currentIdx + 1) return "available";

  return "locked";
}

export const PhaseSelector = memo(function PhaseSelector({
  currentPhase,
  completedPhases,
  onPhaseSelect,
}: PhaseSelectorProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 scrollbar-hide">
      {WORKFLOW_PHASES.map((phase) => {
        const status = getPhaseStatus(phase, currentPhase, completedPhases);

        return (
          <button
            key={phase}
            type="button"
            onClick={() => {
              if (status !== "locked") onPhaseSelect(phase);
            }}
            disabled={status === "locked"}
            className={`
              flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium
              transition-all duration-200 ease-out
              ${
                status === "current"
                  ? "bg-brand-500 text-white font-semibold shadow-sm"
                  : status === "completed"
                    ? "bg-slate-700 text-success-400"
                    : status === "available"
                      ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                      : "text-slate-500 cursor-not-allowed opacity-50"
              }
            `}
            aria-label={`${PHASE_LABELS[phase]} phase - ${status}`}
          >
            {status === "completed" && <Check className="h-3 w-3" />}
            {status === "available" && <Circle className="h-3 w-3" />}
            <span>{PHASE_LABELS[phase]}</span>
          </button>
        );
      })}
    </div>
  );
});
