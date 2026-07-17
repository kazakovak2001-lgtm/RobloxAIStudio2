import { ProtocolMonitor } from "../../components/ProtocolMonitor";
import { AuditLogViewer } from "../../components/AuditLogViewer";
import type { PipelineData } from "../types";

interface MonitoringPropertiesProps {
  pipelineData?: PipelineData;
}

export default function MonitoringProperties({
  pipelineData,
}: MonitoringPropertiesProps) {
  const isConnected = pipelineData?.isConnected ?? false;
  const pipelineId = pipelineData?.pipelineId ?? null;

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Monitoring
      </p>
      <AuditLogViewer pipelineId={pipelineId} />
      <ProtocolMonitor isConnected={isConnected} />
    </div>
  );
}
