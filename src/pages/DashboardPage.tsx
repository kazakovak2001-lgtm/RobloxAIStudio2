import { BarChart3, Bot, PlusCircle } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { ProjectItem } from "../types";

const projects: ProjectItem[] = [
  {
    id: "mine-01",
    name: "Mining Frontier",
    type: "Simulator",
    genre: "Tycoon",
    lastUpdated: "12m ago",
    status: "In review",
    progress: 78,
  },
  {
    id: "pet-02",
    name: "Pet Royale",
    type: "Adventure",
    genre: "RPG",
    lastUpdated: "1h ago",
    status: "Draft",
    progress: 41,
  },
];

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
              Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Your studio command center
            </h1>
            <p className="mt-2 text-slate-400">
              Coordinate projects, agent progress, and future AI handoffs from a
              unified view.
            </p>
          </div>
          <Button to="/new-project">
            <PlusCircle className="mr-2 h-4 w-4" /> New project
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          {[
            ["Projects", "24 active"],
            ["Agents", "8 queued"],
            ["Exports", "3 ready"],
            ["Revenue", "$12k"],
          ].map(([label, value]) => (
            <Card key={label}>
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
            </Card>
          ))}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Recent projects</p>
                <h2 className="text-xl font-semibold text-white">
                  Project overview
                </h2>
              </div>
              <Button to="/projects" variant="secondary" size="sm">
                View all
              </Button>
            </div>
            <div className="space-y-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{project.name}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {project.type} • {project.genre}
                      </p>
                    </div>
                    <span className="rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200">
                      {project.status}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                    <span>Updated {project.lastUpdated}</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-800">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-cyan-400"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Quick actions</p>
                  <h3 className="font-semibold text-white">Launch AI agents</h3>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {["Planner", "Designer", "Builder"].map((agent) => (
                  <div
                    key={agent}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300"
                  >
                    <span>{agent}</span>
                    <span className="text-brand-300">Ready</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Stats</p>
                  <h3 className="font-semibold text-white">Weekly momentum</h3>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Iterations</span>
                  <span className="font-semibold text-white">+18%</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Automation</span>
                  <span className="font-semibold text-white">+41%</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Export readiness</span>
                  <span className="font-semibold text-white">82%</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
