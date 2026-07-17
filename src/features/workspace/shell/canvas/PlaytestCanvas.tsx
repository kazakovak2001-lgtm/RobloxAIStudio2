import { PlaytestPanel } from "../../components/PlaytestPanel";
import { ValidationResults } from "../../components/ValidationResults";

interface PlaytestCanvasProps {
  projectId: string;
}

export default function PlaytestCanvas({ projectId }: PlaytestCanvasProps) {
  return (
    <div className="space-y-4 p-4">
      <PlaytestPanel projectId={projectId} />
      <ValidationResults />
    </div>
  );
}
