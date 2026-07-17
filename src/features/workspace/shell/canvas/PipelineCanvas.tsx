import { AgentBoard } from "../../components/AgentBoard";
import { AutonomousPipelinePanel } from "../../components/AutonomousPipelinePanel";
import type { PipelineData } from "../types";

interface PipelineCanvasProps {
  pipelineData?: PipelineData;
}

export default function PipelineCanvas({ pipelineData }: PipelineCanvasProps) {
  const agents = pipelineData?.agents ?? [];
  const projectId = pipelineData?.projectId ?? "";
  return (
    <div className="space-y-4 p-4">
      <AgentBoard agents={agents} />
      <AutonomousPipelinePanel projectId={projectId} />
    </div>
  );
}
