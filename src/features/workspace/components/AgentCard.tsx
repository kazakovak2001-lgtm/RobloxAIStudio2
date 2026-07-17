import { memo } from "react";
import { motion } from "framer-motion";
import { Activity, Bot, Clock3, Coins, Cpu } from "lucide-react";
import { Badge } from "@/shared/ui/Badge";
import type { AgentState } from "../types";

interface AgentCardProps {
  agent: AgentState;
}

const statusMap: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info"
> = {
  running: "warning",
  completed: "success",
  failed: "danger",
  idle: "info",
  retrying: "warning",
  cancelled: "info",
  paused: "info",
};

function AgentCardComponent({ agent }: AgentCardProps) {
  const progress = Math.max(0, Math.min(100, agent.progress ?? 0));
  const duration =
    agent.duration ??
    (agent.startedAt && agent.finishedAt
      ? Math.round(
          (agent.finishedAt.getTime() - agent.startedAt.getTime()) / 1000,
        )
      : undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_-40px_rgba(34,211,238,0.45)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{agent.name}</p>
            <p className="text-xs text-slate-400">
              {agent.provider ?? "Model provider"}
            </p>
          </div>
        </div>
        <Badge variant={statusMap[agent.status] ?? "default"}>
          {agent.status}
        </Badge>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 via-cyan-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Cpu className="h-3.5 w-3.5" /> {agent.model ?? "gpt-4.1"}
        </span>
        <span className="flex items-center gap-1">
          <Activity className="h-3.5 w-3.5" /> {progress}%
        </span>
        {duration !== undefined && (
          <span className="flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" /> {duration}s
          </span>
        )}
        {agent.cost !== undefined && (
          <span className="flex items-center gap-1">
            <Coins className="h-3.5 w-3.5" /> ${agent.cost.toFixed(4)}
          </span>
        )}
        {agent.tokens !== undefined && <span>Tokens: {agent.tokens}</span>}
      </div>
    </motion.div>
  );
}

export const AgentCard = memo(AgentCardComponent);
export default AgentCard;
