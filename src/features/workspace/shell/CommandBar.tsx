import { memo } from "react";
import { TopBar } from "@/shared/ui/layout/TopBar";
import { useWorkspace } from "../core";
import { PhaseSelector } from "./PhaseSelector";

interface CommandBarProps {
  activeProject?: string;
  aiStatus?: "online" | "offline" | "loading";
  robloxConnectionStatus?: "connected" | "disconnected" | "connecting";
}

export const CommandBar = memo(function CommandBar({
  activeProject,
  aiStatus = "online",
  robloxConnectionStatus = "disconnected",
}: CommandBarProps) {
  const { state, setPhase } = useWorkspace();
  const { currentPhase, completedPhases } = state;

  return (
    <div className="z-40 flex flex-col">
      <TopBar
        activeProject={activeProject}
        aiStatus={aiStatus}
        robloxConnectionStatus={robloxConnectionStatus}
      />
      <div className="border-b border-white/10 bg-slate-900/70">
        <PhaseSelector
          currentPhase={currentPhase}
          completedPhases={completedPhases}
          onPhaseSelect={setPhase}
        />
      </div>
    </div>
  );
});
