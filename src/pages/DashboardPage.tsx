import { useEffect, useState } from "react";
import { BarChart3, Bot, PlusCircle, Wifi, WifiOff } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { listProjects, type Project } from "../services/projectService";
import { getActiveProvider } from "../services/aiEngine";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [provider, setProvider] = useState("loading...");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [projs, prov] = await Promise.all([
        listProjects(),
        getActiveProvider(),
      ]);
      setProjects(projs);
      setProvider(prov);
      setLoading(false);
    };
    void load();
  }, []);

  const projectCount = projects.length;
  const backendOnline = provider !== "unavailable";

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
              Coordinate projects, agents, and AI generation from a unified
              view.
            </p>
          </div>
          <Button to="/new-project">
            <PlusCircle className="mr-2 h-4 w-4" /> New project
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card>
            <p className="text-sm text-slate-400">Projects</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {loading ? "..." : projectCount}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-400">AI Provider</p>
            <p className="mt-3 text-2xl font-semibold text-white">{provider}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-400">Backend</p>
            <p className="mt-3 flex items-center gap-2 text-2xl font-semibold text-white">
              {backendOnline ? (
                <>
                  <Wifi className="h-5 w-5 text-green-400" /> Online
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-red-400" /> Offline
                </>
              )}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-400">Platform</p>
            <p className="mt-3 text-2xl font-semibold text-white">v3.0 Beta</p>
          </Card>
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
            {loading && <p className="text-sm text-slate-400">Loading...</p>}
            {!loading && projects.length === 0 && (
              <p className="text-sm text-slate-400">
                No projects yet.{" "}
                <Button to="/new-project" variant="ghost" size="sm">
                  Create one
                </Button>
              </p>
            )}
            <div className="space-y-4">
              {projects.slice(0, 5).map((project) => (
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
                  <p className="text-sm text-slate-400">AI Agents</p>
                  <h3 className="font-semibold text-white">Pipeline Agents</h3>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Planner",
                  "Designer",
                  "Architect",
                  "Builder",
                  "Validator",
                ].map((agent) => (
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
                  <p className="text-sm text-slate-400">Platform Status</p>
                  <h3 className="font-semibold text-white">System Health</h3>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Generation Engine</span>
                  <span className="font-semibold text-green-400">
                    Operational
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Job Queue</span>
                  <span className="font-semibold text-green-400">Active</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Studio Bridge</span>
                  <span className="font-semibold text-yellow-400">Standby</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
