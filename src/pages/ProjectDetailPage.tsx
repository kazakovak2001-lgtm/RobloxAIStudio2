import { Bot, Download, FileText, Layers3 } from "lucide-react";
import { useParams } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

const tabs = [
  "Overview",
  "Files",
  "AI Chat",
  "Agents",
  "Logs",
  "Settings",
  "Export",
];

export default function ProjectDetailPage() {
  const { id } = useParams();

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
              Project detail
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              {id?.toUpperCase() || "Project"} workspace
            </h1>
            <p className="mt-2 text-slate-400">
              A modular project surface with tabs for current and future
              integrations.
            </p>
          </div>
          <Button to="/projects" variant="secondary">
            Back to projects
          </Button>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10"
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Overview</p>
                <h2 className="text-xl font-semibold text-white">
                  Project snapshot
                </h2>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-sm text-slate-400">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Vision: Create a polished mining simulator with pets, rebirths,
                and progression systems.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Status: AI pipeline infrastructure ready for future generation
                and export.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Next milestone: Wire the backend and deploy the first generation
                flow.
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">AI Chat</p>
                  <h3 className="font-semibold text-white">
                    Conversational workspace
                  </h3>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">
                  Planner: I can help structure progression, economy, and game
                  feel.
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">
                  Builder: I can prepare a component map for your future Roblox
                  project.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                  Type a prompt to continue the AI workflow.
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Files and export</p>
                  <h3 className="font-semibold text-white">
                    Ready for future export
                  </h3>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Project plan
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Gameplay notes
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  UI references
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Export package
                </div>
              </div>
              <Button className="mt-4" variant="secondary" to="/settings">
                <Download className="mr-2 h-4 w-4" /> Export placeholder
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
