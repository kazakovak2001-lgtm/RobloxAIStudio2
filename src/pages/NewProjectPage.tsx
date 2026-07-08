import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { createProject } from "../services/projectService";
import { generateConcept, type GameConcept } from "../services/conceptApi";

export default function NewProjectPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<GameConcept | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!type.trim()) {
      setError("Game type is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Step 1: Generate AI concept
    const conceptResult = await generateConcept({
      gameDescription: `${name} - ${description || type}`,
      genre: genre || type,
      style: type,
    });

    if (conceptResult.success && conceptResult.data) {
      setConcept(conceptResult.data);

      // Step 2: Create project in backend
      const project = await createProject({
        name: name.trim(),
        type: type.trim(),
        genre: genre.trim() || type.trim(),
        description: description.trim(),
      });
      setIsSubmitting(false);

      if (project) {
        navigate(`/projects/${project.id}`);
      } else {
        setError("Project created but failed to save. Check backend.");
      }
    } else {
      setIsSubmitting(false);
      setError(conceptResult.error ?? "Concept generation failed");
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
            New project
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Create a new Roblox concept draft
          </h1>
          <p className="mt-2 text-slate-400">
            Fill in the details and generate your game concept.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
          <Card>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block text-sm text-slate-300">
                Project Name *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-brand-400"
                  placeholder="Cosmic Miner"
                />
              </label>

              <label className="block text-sm text-slate-300">
                Game Type *
                <input
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-brand-400"
                  placeholder="Mining Simulator"
                />
              </label>

              <label className="block text-sm text-slate-300">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-brand-400"
                  placeholder="Create an approachable tycoon experience..."
                />
              </label>

              <label className="block text-sm text-slate-300">
                Genre
                <input
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-brand-400"
                  placeholder="Tycoon / Adventure"
                />
              </label>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                className="w-full"
                onClick={() =>
                  handleSubmit({ preventDefault: () => {} } as React.FormEvent)
                }
              >
                {isSubmitting ? "Creating..." : "Generate concept"}{" "}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-sm text-slate-400">
                  {concept ? "Concept Generated" : "AI-Powered"}
                </p>
                <h2 className="text-xl font-semibold text-white">
                  {concept?.title ?? "Generation Pipeline"}
                </h2>
              </div>
            </div>
            {concept ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-slate-500">Gameplay Loop</p>
                  <p className="text-slate-300">{concept.gameplayLoop}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-slate-500">Features</p>
                  <p className="text-slate-300">
                    {concept.features.slice(0, 4).join(", ")}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-slate-500">Systems</p>
                  <p className="text-slate-300">
                    {concept.systemsPlan.join(", ")}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-slate-500">UI Screens</p>
                  <p className="text-slate-300">{concept.uiPlan.join(", ")}</p>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-3 text-sm text-slate-400">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  Planner agent structures gameplay loops and objectives.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  Designer agent defines UI, progression, and economy.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  Builder agents generate Lua scripts and assets.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
