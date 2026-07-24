import { FolderKanban, TrendingUp, Clock, CheckCircle } from "lucide-react";

export interface ProjectOverviewProps {
  totalProjects?: number;
  activeProjects?: number;
  completedProjects?: number;
  recentProjects?: number;
  loading?: boolean;
}

export function ProjectOverview({
  totalProjects = 0,
  activeProjects = 0,
  completedProjects = 0,
  recentProjects = 0,
  loading = false,
}: ProjectOverviewProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-slate-800" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-slate-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: "Total Projects",
      value: totalProjects,
      icon: <FolderKanban className="h-4 w-4 text-brand-400" />,
      trend: "+12%",
    },
    {
      label: "Active",
      value: activeProjects,
      icon: <TrendingUp className="h-4 w-4 text-success-400" />,
      trend: "+5%",
    },
    {
      label: "Completed",
      value: completedProjects,
      icon: <CheckCircle className="h-4 w-4 text-success-400" />,
      trend: "+8%",
    },
    {
      label: "Recent (7d)",
      value: recentProjects,
      icon: <Clock className="h-4 w-4 text-warning-400" />,
      trend: "+3%",
    },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow backdrop-blur-xl">
      <h3 className="mb-4 text-h3 font-semibold text-white">
        Project Overview
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/5 bg-slate-800/50 p-4 transition hover:border-brand-400/20"
          >
            <div className="mb-2 flex items-center gap-2">
              {stat.icon}
              <span className="text-sm text-slate-400">{stat.label}</span>
            </div>
            <div className="mb-1 text-2xl font-semibold text-white">
              {stat.value}
            </div>
            <div className="text-xs text-success-400">{stat.trend}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
