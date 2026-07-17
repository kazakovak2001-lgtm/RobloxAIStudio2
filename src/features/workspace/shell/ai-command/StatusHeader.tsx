import { PipelineStatusBar } from "../../components/PipelineStatusBar";
import type { PipelineState, WorkspaceStatus } from "../../types";

interface StatusHeaderProps {
  pipeline: PipelineState | null;
  status: WorkspaceStatus | null;
}

export default function StatusHeader({ pipeline, status }: StatusHeaderProps) {
  const effectiveStatus: WorkspaceStatus = status ?? "idle";
  return (
    <div className="border-b border-white/5 px-3 py-1">
      <PipelineStatusBar pipeline={pipeline} status={effectiveStatus} />
    </div>
  );
}
