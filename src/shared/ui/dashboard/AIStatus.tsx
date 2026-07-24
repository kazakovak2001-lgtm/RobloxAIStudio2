import { Bot, Zap, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export interface AIStatusProps {
  status?: "online" | "offline" | "loading" | "error";
  provider?: string;
  model?: string;
  tokensUsed?: number;
  tokensLimit?: number;
  cost?: number;
  loading?: boolean;
}

export function AIStatus({
  status = "online",
  provider = "OpenAI",
  model = "GPT-4",
  tokensUsed = 0,
  tokensLimit = 100000,
  cost = 0,
  loading = false,
}: AIStatusProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-slate-800" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = {
    online: {
      icon: <CheckCircle className="h-4 w-4 text-success-400" />,
      label: "Online",
      bgColor: "bg-success-500/10",
      textColor: "text-success-400",
    },
    offline: {
      icon: <AlertCircle className="h-4 w-4 text-error-400" />,
      label: "Offline",
      bgColor: "bg-error-500/10",
      textColor: "text-error-400",
    },
    loading: {
      icon: <Loader2 className="h-4 w-4 text-warning-400 animate-spin" />,
      label: "Loading",
      bgColor: "bg-warning-500/10",
      textColor: "text-warning-400",
    },
    error: {
      icon: <AlertCircle className="h-4 w-4 text-error-400" />,
      label: "Error",
      bgColor: "bg-error-500/10",
      textColor: "text-error-400",
    },
  };

  const config = statusConfig[status];
  const tokenPercentage = (tokensUsed / tokensLimit) * 100;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-white">AI Status</h3>
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 ${config.bgColor} ${config.textColor}`}
        >
          {config.icon}
          <span className="text-xs font-medium">{config.label}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Provider */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand-400" />
            <span className="text-sm text-slate-400">Provider</span>
          </div>
          <span className="text-sm font-medium text-white">{provider}</span>
        </div>

        {/* Model */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-sm text-slate-400">Model</span>
          </div>
          <span className="text-sm font-medium text-white">{model}</span>
        </div>

        {/* Token Usage */}
        <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-400">Token Usage</span>
            <span className="text-sm font-medium text-white">
              {tokensUsed.toLocaleString()} / {tokensLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-700">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-accent transition-all duration-300"
              style={{ width: `${tokenPercentage}%` }}
            />
          </div>
        </div>

        {/* Cost */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <span className="text-sm text-slate-400">Total Cost</span>
          <span className="text-sm font-medium text-white">
            ${cost.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
