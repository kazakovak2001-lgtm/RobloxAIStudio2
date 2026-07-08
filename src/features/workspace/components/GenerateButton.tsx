import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { runAgentPipeline } from "../../../services/aiEngine";
import { generateExperience } from "../../../services/conceptApi";

type GenerationStatus =
  "idle" | "queued" | "running" | "validating" | "completed" | "failed";

interface GenerateButtonProps {
  projectId: string;
  conceptId?: string;
  pipelineStatus: string;
  onStarted?: (executionId: string) => void;
  onError?: (error: string) => void;
}

export function GenerateButton({
  projectId,
  conceptId,
  pipelineStatus,
  onStarted,
  onError,
}: GenerateButtonProps) {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const isRunning =
    pipelineStatus === "running" || status === "running" || status === "queued";

  useEffect(() => {
    if (pipelineStatus === "completed" && status === "running") {
      setStatus("completed");
    }
    if (pipelineStatus === "failed" && status === "running") {
      setStatus("failed");
    }
  }, [pipelineStatus, status]);

  const handleGenerate = async () => {
    if (isRunning) return;
    setStatus("queued");
    setError(null);

    // If we have a conceptId, use the concept experience pipeline
    if (conceptId) {
      const result = await generateExperience(conceptId);
      if (result.success && result.data) {
        setStatus("running");
        onStarted?.(result.data.pipelineId);
      } else {
        setStatus("failed");
        const msg = result.error ?? "Experience generation failed to start";
        setError(msg);
        onError?.(msg);
      }
      return;
    }

    // Fallback: use the classic project generate endpoint
    const result = await runAgentPipeline(projectId);

    if (result.success && result.executionId) {
      setStatus("running");
      onStarted?.(result.executionId);
    } else {
      setStatus("failed");
      const msg = result.error ?? "Generation failed to start";
      setError(msg);
      onError?.(msg);
    }
  };

  const statusColors: Record<GenerationStatus, string> = {
    idle: "from-brand-500 to-accent",
    queued: "from-yellow-500 to-orange-500",
    running: "from-cyan-500 to-blue-500",
    validating: "from-purple-500 to-pink-500",
    completed: "from-green-500 to-emerald-500",
    failed: "from-red-500 to-rose-500",
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleGenerate}
        disabled={isRunning}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r ${statusColors[status]} px-5 py-3 text-sm font-medium text-white shadow-glow transition-all hover:translate-y-[-1px] disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {status === "idle" && "Generate Experience"}
        {status === "queued" && "Queuing..."}
        {status === "running" && "Generating..."}
        {status === "validating" && "Validating..."}
        {status === "completed" && "Generation Complete ✓"}
        {status === "failed" && "Retry Generation"}
      </button>
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
