import { SimulationPanel } from "../../components/SimulationPanel";
import { EconomyPanel } from "../../components/EconomyPanel";

interface SimulationCanvasProps {
  projectId: string;
}

export default function SimulationCanvas({ projectId }: SimulationCanvasProps) {
  return (
    <div className="space-y-4 p-4">
      <SimulationPanel projectId={projectId} />
      <EconomyPanel projectId={projectId} />
    </div>
  );
}
