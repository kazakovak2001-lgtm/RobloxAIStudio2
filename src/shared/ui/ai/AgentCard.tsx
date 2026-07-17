import { Bot, Settings, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export interface Agent {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "ready" | "running" | "error";
  icon?: React.ReactNode;
}

export interface AgentCardProps {
  agent: Agent;
  onSelect?: () => void;
  onConfigure?: () => void;
  selected?: boolean;
}

export function AgentCard({
  agent,
  onSelect,
  onConfigure,
  selected = false,
}: AgentCardProps) {
  const statusConfig = {
    ready: {
      icon: <CheckCircle className="h-4 w-4 text-success-400" />,
      label: "Ready",
      bgColor: "bg-success-500/10",
      textColor: "text-success-400",
    },
    running: {
      icon: <Loader2 className="h-4 w-4 text-brand-400 animate-spin" />,
      label: "Running",
      bgColor: "bg-brand-500/10",
      textColor: "text-brand-400",
    },
    error: {
      icon: <AlertCircle className="h-4 w-4 text-error-400" />,
      label: "Error",
      bgColor: "bg-error-500/10",
      textColor: "text-error-400",
    },
  };

  const config = statusConfig[agent.status];

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-2xl border bg-slate-900/70 p-4 shadow-glow backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/40 ${
        selected ? "border-brand-400/50 bg-brand-500/5" : "border-white/10"
      }`}
    >
      <div className="flex items-start justify-between">
        {/* Left Section */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent">
            {agent.icon || <Bot className="h-5 w-5 text-white" />}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h4 className="text-base font-semibold text-white">{agent.name}</h4>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                v{agent.version}
              </span>
            </div>
            <p className="mb-2 text-sm text-slate-400">{agent.description}</p>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${config.bgColor} ${config.textColor}`}
            >
              {config.icon}
              <span className="text-xs font-medium">{config.label}</span>
            </div>
          </div>
        </div>

        {/* Configure Button */}
        {onConfigure && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            type="button"
            aria-label={`Configure ${agent.name}`}
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
