import { Copy, Filter, Plus, Search, Trash2 } from "lucide-react";
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
  {
    id: "battle-03",
    name: "Battle Arena",
    type: "Combat",
    genre: "Action",
    lastUpdated: "2d ago",
    status: "Planning",
    progress: 24,
  },
];

export default function ProjectsPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
              Projects
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Your project library
            </h1>
            <p className="mt-2 text-slate-400">
              Search, filter, duplicate, or archive concepts before they
              advance.
            </p>
          </div>
          <Button to="/new-project">
            <Plus className="mr-2 h-4 w-4" /> New project
          </Button>
        </div>

        <Card className="mb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Search projects"
              />
            </div>
            <div className="flex gap-3">
              <button
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300"
                type="button"
              >
                <Filter className="h-4 w-4" /> Filters
              </button>
              <Button to="/new-project" variant="secondary" size="sm">
                Create
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400">{project.type}</p>
                  <h3 className="mt-1 text-xl font-semibold text-white">
                    {project.name}
                  </h3>
                </div>
                <span className="rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200">
                  {project.status}
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                Genre: {project.genre}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Updated {project.lastUpdated}
              </p>
              <div className="mt-4 h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-cyan-400"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  to={`/projects/${project.id}`}
                  variant="secondary"
                  size="sm"
                >
                  Open
                </Button>
                <button
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300"
                  type="button"
                  aria-label="duplicate"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300"
                  type="button"
                  aria-label="delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
