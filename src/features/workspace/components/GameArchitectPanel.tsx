import { useState } from "react";
import { Brain, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  generateArchitectPlan,
  type GameIdeaInput,
  type GameArchitectResult,
} from "@/services/gameArchitectApi";

export function GameArchitectPanel() {
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [theme, setTheme] = useState("");
  const [style, setStyle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GameArchitectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (description.trim().length < 5) return;
    setIsLoading(true);
    setError(null);

    const input: GameIdeaInput = {
      description: description.trim(),
      genre: genre || undefined,
      theme: theme || undefined,
      visualStyle: style || undefined,
    };

    const response = await generateArchitectPlan(input);
    if (response.success && response.data) {
      setResult(response.data);
    } else {
      setError(response.error ?? "Failed to generate");
    }
    setIsLoading(false);
  };

  const qualityColor =
    result?.qualityScore.classification === "production_ready"
      ? "text-green-400"
      : result?.qualityScore.classification === "needs_refinement"
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-brand-400" />
        <p className="text-sm font-semibold text-white">Game Architect</p>
      </div>

      {/* Input form */}
      <div className="mt-3 space-y-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your game idea..."
          className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-brand-400 h-16"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="Genre"
            className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[11px] text-white outline-none focus:border-brand-400"
          />
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Theme"
            className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[11px] text-white outline-none focus:border-brand-400"
          />
          <input
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Visual style"
            className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[11px] text-white outline-none focus:border-brand-400"
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading || description.trim().length < 5}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500/20 px-3 py-2 text-xs font-medium text-brand-300 hover:bg-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Brain className="h-3.5 w-3.5" />
          )}
          {isLoading ? "Generating..." : "Generate Architecture"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {/* Results */}
      {result && (
        <div className="mt-3 space-y-2">
          {/* Quality Score */}
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <span className="text-xs text-slate-400">Quality Score</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${qualityColor}`}>
                {result.qualityScore.overall}/100
              </span>
              {result.qualityScore.classification === "production_ready" ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
              )}
            </div>
          </div>

          {/* Analysis summary */}
          <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px]">
            <p className="text-slate-500 mb-1">Analysis</p>
            <p className="text-slate-300">
              Genre: {result.analysis.genre} • Complexity:{" "}
              {result.analysis.technicalComplexity}/100
            </p>
            <p className="text-slate-400 mt-0.5">
              Systems: {result.analysis.requiredSystems.slice(0, 4).join(", ")}
            </p>
          </div>

          {/* Agent prompts */}
          <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px]">
            <p className="text-slate-500 mb-1">
              Agent Prompts ({result.agentPrompts.totalAgents})
            </p>
            <div className="space-y-0.5">
              {result.agentPrompts.prompts.map((p) => (
                <div
                  key={p.agentId}
                  className="flex items-center justify-between"
                >
                  <span className="text-slate-300">{p.agentName}</span>
                  <span className="text-slate-500">
                    {p.responsibilities.length} tasks
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-white/[0.02] px-2 py-1">
              <p className="text-[9px] text-slate-500">Complete</p>
              <p className="text-[11px] font-medium text-slate-300">
                {result.qualityScore.completeness}%
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.02] px-2 py-1">
              <p className="text-[9px] text-slate-500">Technical</p>
              <p className="text-[11px] font-medium text-slate-300">
                {result.qualityScore.technicalAccuracy}%
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.02] px-2 py-1">
              <p className="text-[9px] text-slate-500">Roblox</p>
              <p className="text-[11px] font-medium text-slate-300">
                {result.qualityScore.robloxCompatibility}%
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
