import { ArrowRight, Sparkles } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

const fields = [
  { label: "Project Name", placeholder: "Cosmic Miner" },
  { label: "Game Type", placeholder: "Mining Simulator" },
  {
    label: "Description",
    placeholder: "Create an approachable tycoon experience...",
  },
  { label: "Genre", placeholder: "Tycoon / Adventure" },
  { label: "Difficulty", placeholder: "Medium" },
  { label: "Players", placeholder: "Solo + multiplayer" },
  {
    label: "Target Audience",
    placeholder: "Young creators and casual players",
  },
];

export default function NewProjectPage() {
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
            The form is ready for future AI generation and deeper project
            orchestration.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
          <Card>
            <form className="space-y-4">
              {fields.map((field) => (
                <label
                  key={field.label}
                  className="block text-sm text-slate-300"
                >
                  {field.label}
                  {field.label === "Description" ? (
                    <textarea
                      className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none"
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <input
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none"
                      placeholder={field.placeholder}
                    />
                  )}
                </label>
              ))}

              <Button className="w-full" to="/projects">
                Generate concept <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Prompt-ready</p>
                <h2 className="text-xl font-semibold text-white">
                  Future AI pipeline
                </h2>
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-400">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Planner agent will structure gameplay loops and objectives.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Designer agent will define UI, progression, and economy hooks.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Builder and QA agents will be chained in later phases.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
