import { ArtifactExplorer } from "../../components/ArtifactExplorer";

interface CodeCanvasProps {
  pipelineId: string | null;
  onReviewChange?: () => void;
}

export default function CodeCanvas({
  pipelineId,
  onReviewChange,
}: CodeCanvasProps) {
  return (
    <div className="space-y-4 p-4">
      <ArtifactExplorer
        pipelineId={pipelineId}
        onReviewChange={onReviewChange}
      />
    </div>
  );
}
