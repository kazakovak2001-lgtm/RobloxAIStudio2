import { useState, useEffect, useCallback } from "react";
import { Card } from "@/shared/ui/Card";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Loader } from "@/shared/ui/Loader";
import { Search, BookOpen, Sparkles, Brain } from "lucide-react";
import {
  getPatterns,
  getPrompts,
  getRecommendations,
  type GamePattern,
  type PromptRecord,
  type PatternType,
  type KnowledgeRecommendation,
} from "@/services/knowledgeApi";

type Tab = "patterns" | "prompts" | "recommendations";

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<Tab>("patterns");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Patterns state
  const [patterns, setPatterns] = useState<GamePattern[]>([]);
  const [patternFilter, setPatternFilter] = useState<PatternType | "">("");

  // Prompts state
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);

  // Recommendations state
  const [recommendations, setRecommendations] =
    useState<KnowledgeRecommendation | null>(null);
  const [recGenre, setRecGenre] = useState("adventure");

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getPatterns(patternFilter || undefined);
    if (res.success) {
      setPatterns(res.data ?? []);
    } else {
      setError(res.error ?? "Failed to load patterns");
    }
    setLoading(false);
  }, [patternFilter]);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getPrompts();
    if (res.success) {
      setPrompts(res.data ?? []);
    } else {
      setError(res.error ?? "Failed to load prompts");
    }
    setLoading(false);
  }, []);

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getRecommendations(recGenre);
    if (res.success && res.data) {
      setRecommendations(res.data);
    } else {
      setError(res.error ?? "Failed to load recommendations");
    }
    setLoading(false);
  }, [recGenre]);

  useEffect(() => {
    if (activeTab === "patterns") fetchPatterns();
    else if (activeTab === "prompts") fetchPrompts();
    else fetchRecommendations();
  }, [activeTab, fetchPatterns, fetchPrompts, fetchRecommendations]);

  const patternTypeVariant = (type: PatternType) => {
    switch (type) {
      case "combat":
      case "quest":
        return "danger" as const;
      case "economy":
      case "progression":
        return "warning" as const;
      case "inventory":
      case "save":
        return "info" as const;
      default:
        return "default" as const;
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "patterns",
      label: "Patterns",
      icon: <BookOpen className="h-4 w-4" />,
    },
    { id: "prompts", label: "Prompts", icon: <Sparkles className="h-4 w-4" /> },
    {
      id: "recommendations",
      label: "Recommendations",
      icon: <Brain className="h-4 w-4" />,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
          Knowledge Base
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          AI Learning & Patterns
        </h1>
        <p className="mt-2 text-slate-400">
          Browse learned game patterns, prompt rankings, and AI recommendations.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-white/10 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
              activeTab === tab.id
                ? "bg-brand-500 text-white"
                : "border border-white/10 text-slate-300 hover:bg-white/5"
            }`}
            type="button"
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader size="lg" label="Loading knowledge base..." />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Card>
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-error-400">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                if (activeTab === "patterns") fetchPatterns();
                else if (activeTab === "prompts") fetchPrompts();
                else fetchRecommendations();
              }}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Patterns Tab */}
      {!loading && !error && activeTab === "patterns" && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPatternFilter("")}
              className={`rounded-full px-3 py-1 text-xs transition ${!patternFilter ? "bg-brand-500 text-white" : "border border-white/10 text-slate-400 hover:bg-white/5"}`}
              type="button"
            >
              All
            </button>
            {(
              [
                "inventory",
                "quest",
                "combat",
                "dialogue",
                "economy",
                "save",
                "lobby",
                "multiplayer",
                "progression",
                "ui",
              ] as PatternType[]
            ).map((t) => (
              <button
                key={t}
                onClick={() => setPatternFilter(t)}
                className={`rounded-full px-3 py-1 text-xs transition ${patternFilter === t ? "bg-brand-500 text-white" : "border border-white/10 text-slate-400 hover:bg-white/5"}`}
                type="button"
              >
                {t}
              </button>
            ))}
          </div>

          {patterns.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-400 py-4 text-center">
                No patterns learned yet. Run generations to build the knowledge
                base.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {patterns.map((p) => (
                <Card key={p.id}>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={patternTypeVariant(p.type)}>{p.type}</Badge>
                    <span className="text-xs text-slate-500">
                      {p.usageCount} uses
                    </span>
                  </div>
                  <h4 className="font-medium text-white">{p.name}</h4>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                    {p.description}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Score:</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-1.5 rounded-full bg-success-400"
                        style={{ width: `${p.averageScore}%` }}
                      />
                    </div>
                    <span className="text-xs text-white">
                      {p.averageScore.toFixed(0)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prompts Tab */}
      {!loading && !error && activeTab === "prompts" && (
        <div className="space-y-4">
          {prompts.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-400 py-4 text-center">
                No prompt data available yet.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {prompts.map((pr) => (
                <Card key={pr.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {pr.agentType}
                      </p>
                      <p className="text-xs text-slate-400">
                        {pr.genre} • {pr.usageCount} uses • {pr.tokenUsage}{" "}
                        tokens
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-white">
                        {(pr.successRate * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-slate-500">success</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-brand-500"
                      style={{ width: `${pr.successRate * 100}%` }}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommendations Tab */}
      {!loading && !error && activeTab === "recommendations" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={recGenre}
                onChange={(e) => setRecGenre(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                placeholder="Genre (e.g. adventure, tycoon)"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchRecommendations}
              >
                Search
              </Button>
            </div>
          </Card>

          {!recommendations ? (
            <Card>
              <p className="text-sm text-slate-400 py-4 text-center">
                Enter a genre to get AI recommendations.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <h4 className="text-sm font-semibold text-white mb-3">
                  Similar Projects
                </h4>
                {recommendations.similarProjects.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No similar projects found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recommendations.similarProjects.map((sp, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-white/5 bg-white/[0.02] p-2"
                      >
                        <p className="text-xs text-white truncate">
                          {sp.projectId}
                        </p>
                        <p className="text-xs text-slate-500">
                          Score: {sp.score.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <h4 className="text-sm font-semibold text-white mb-3">
                  Recommended Patterns
                </h4>
                {recommendations.recommendedPatterns.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No patterns recommended.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recommendations.recommendedPatterns.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2"
                      >
                        <span className="text-xs text-white">{p.name}</span>
                        <Badge variant={patternTypeVariant(p.type)}>
                          {p.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <h4 className="text-sm font-semibold text-white mb-3">
                  Best Prompts
                </h4>
                {recommendations.bestPrompts.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No prompts ranked yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recommendations.bestPrompts.map((pr) => (
                      <div
                        key={pr.id}
                        className="rounded-lg border border-white/5 bg-white/[0.02] p-2"
                      >
                        <p className="text-xs text-white">{pr.agentType}</p>
                        <p className="text-xs text-slate-500">
                          {(pr.successRate * 100).toFixed(0)}% success
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
