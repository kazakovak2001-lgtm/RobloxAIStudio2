import { StudioBridgePanel } from "../../components/StudioBridgePanel";
import type { PipelineData } from "../types";

interface ExportPropertiesProps {
  pipelineData?: PipelineData;
}

export default function ExportProperties({
  pipelineData,
}: ExportPropertiesProps) {
  const projectId = pipelineData?.projectId ?? "";
  const status = pipelineData?.status ?? "idle";

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Export &amp; Studio
      </p>
      <StudioBridgePanel projectId={projectId} status={String(status)} />
    </div>
  );
}
