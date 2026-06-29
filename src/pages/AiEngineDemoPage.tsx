import { useEffect, useState } from "react";
import { AppLayout } from "../layouts/AppLayout";
import { Card } from "../components/ui/Card";
import { runAgentPipeline } from "../services/aiEngine";

export default function AiEngineDemoPage() {
  const [result, setResult] = useState<string>("Running the pipeline...");

  useEffect(() => {
    runAgentPipeline(
      "Create a Roblox mining simulator with pets and rebirths"
    ).then((pipelineResult) => {
      setResult(JSON.stringify(pipelineResult, null, 2));
    });
  }, []);

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
            AI Engine
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Multi-agent orchestration demo
          </h1>
          <p className="mt-2 text-slate-400">
            This page exercises the new modular engine and shows the
            orchestrator’s structured log output.
          </p>
        </div>
        <Card>
          <pre className="whitespace-pre-wrap text-sm text-slate-300">
            {result}
          </pre>
        </Card>
      </div>
    </AppLayout>
  );
}
