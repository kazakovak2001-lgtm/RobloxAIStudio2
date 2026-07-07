import { useEffect, useState } from "react";
import { Copy, Filter, Plus, Search, Trash2 } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  listProjects,
  deleteProject,
  type Project,
} from "../services/projectService";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    setLoading(true);
    const data = await listProjects();
    setProjects(data);
    setLoading(false);
  };

  useEffect(() => {
    void fetchProjects();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    const success = await deleteProject(id);
    if (success) setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.genre.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase()),
  );

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
              {projects.length} project(s) • Search, open, or create new.
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none"
                placeholder="Search projects"
              />
            </div>
            <div className="flex gap-3">
              <button
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300"
                type="button"
                onClick={fetchProjects}
              >
                <Filter className="h-4 w-4" /> Refresh
              </button>
              <Button to="/new-project" variant="secondary" size="sm">
                Create
              </Button>
            </div>
          </div>
        </Card>

        {loading && (
          <p className="text-center text-slate-400">Loading projects...</p>
        )}

        {!loading && filtered.length === 0 && (
          <Card>
            <p className="text-center text-slate-400 py-8">
              No projects found.{" "}
              <Button to="/new-project" variant="ghost" size="sm">
                Create one
              </Button>
            </p>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
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
                Updated:{" "}
                {project.updatedAt
                  ? new Date(project.updatedAt).toLocaleDateString()
                  : "—"}
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
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10"
                  type="button"
                  aria-label="duplicate"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-red-400 hover:bg-red-500/10"
                  type="button"
                  aria-label="delete"
                  onClick={() => handleDelete(project.id)}
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
