import { memo } from "react";
import { Coins } from "lucide-react";
import { Card } from "../../../components/ui/Card";

interface CostMonitorProps {
  cost?: number;
  estimatedRemaining?: number;
}

function CostMonitorComponent({ cost, estimatedRemaining }: CostMonitorProps) {
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-emerald-500/10 p-2 text-emerald-300">
            <Coins className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Cost monitor</p>
            <p className="text-xs text-slate-500">
              Live spend and projected remaining budget.
            </p>
          </div>
        </div>
        <div className="space-y-2 text-sm text-slate-300">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>Spent</span>
            <span className="font-semibold text-white">
              ${(cost ?? 0).toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>Est. remaining</span>
            <span className="font-semibold text-white">
              ${(estimatedRemaining ?? 0).toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export const CostMonitor = memo(CostMonitorComponent);
export default CostMonitor;
