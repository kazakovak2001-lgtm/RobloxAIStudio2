import { memo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import { ProgressTimeline } from "./components/ProgressTimeline";
import type { PipelineState } from "./types";

interface PipelineViewProps {
  pipeline: PipelineState | null;
  status: string;
}

function PipelineViewComponent({ pipeline, status }: PipelineViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <Card className="border-brand-400/20 bg-gradient-to-br from-slate-900/80 to-brand-950/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Pipeline overview
              </p>
              <p className="text-xs text-slate-400">
                Live execution view for the current Roblox generation workflow.
              </p>
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {status}
          </div>
        </div>
      </Card>
      <ProgressTimeline pipeline={pipeline} />
    </motion.div>
  );
}

export const PipelineView = memo(PipelineViewComponent);
export default PipelineView;
