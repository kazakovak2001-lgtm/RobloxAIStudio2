import { memo } from "react";
import { Cpu } from "lucide-react";
import { Card } from "../../../components/ui/Card";

interface TokenUsageProps {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

function TokenUsageComponent({
  promptTokens,
  completionTokens,
  totalTokens,
}: TokenUsageProps) {
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-300">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Token usage</p>
            <p className="text-xs text-slate-500">
              Prompt, completion, and total consumption.
            </p>
          </div>
        </div>
        <div className="space-y-2 text-sm text-slate-300">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>Prompt tokens</span>
            <span className="font-semibold text-white">
              {promptTokens ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>Completion tokens</span>
            <span className="font-semibold text-white">
              {completionTokens ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>Total tokens</span>
            <span className="font-semibold text-white">{totalTokens ?? 0}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export const TokenUsage = memo(TokenUsageComponent);
export default TokenUsage;
