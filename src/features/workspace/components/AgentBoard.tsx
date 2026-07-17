import { memo, useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import { AgentCard } from "./AgentCard";
import type { AgentState } from "../types";

interface AgentBoardProps {
  agents: AgentState[];
}

function AgentBoardComponent({ agents }: AgentBoardProps) {
  const orderedAgents = useMemo(() => {
    const order = [
      "Planner",
      "Designer",
      "Architect",
      "Lua Generator",
      "UI Generator",
      "QA Agent",
    ];
    return [...agents].sort((left, right) => {
      const leftIndex = order.indexOf(left.name);
      const rightIndex = order.indexOf(right.name);
      if (leftIndex === -1 && rightIndex === -1)
        return left.name.localeCompare(right.name);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
  }, [agents]);

  if (!orderedAgents.length) {
    return (
      <Card>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold text-white">Agent board</p>
          </div>
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 p-4 text-sm text-slate-400">
            Start a pipeline to populate the live agent board.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Agent board</p>
            <p className="text-xs text-slate-500">
              Real-time execution view for each AI specialist.
            </p>
          </div>
          <div className="rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200">
            {orderedAgents.length} agents
          </div>
        </div>
        <div className="space-y-3">
          {orderedAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </Card>
  );
}

export const AgentBoard = memo(AgentBoardComponent);
export default AgentBoard;
