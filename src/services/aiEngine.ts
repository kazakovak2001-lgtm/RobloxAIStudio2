import { Orchestrator } from "../../agents/orchestrator/Orchestrator";
import { AssetPlannerAgent } from "../../agents/agents/AssetPlannerAgent";
import { DatabaseAgent } from "../../agents/agents/DatabaseAgent";
import { DebugAgent } from "../../agents/agents/DebugAgent";
import { DocumentationAgent } from "../../agents/agents/DocumentationAgent";
import { GameDesignerAgent } from "../../agents/agents/GameDesignerAgent";
import { LuaGeneratorAgent } from "../../agents/agents/LuaGeneratorAgent";
import { OrchestratorAgent } from "../../agents/agents/OrchestratorAgent";
import { PerformanceAgent } from "../../agents/agents/PerformanceAgent";
import { PlannerAgent } from "../../agents/agents/PlannerAgent";
import { RequirementsAgent } from "../../agents/agents/RequirementsAgent";
import { RobloxArchitectAgent } from "../../agents/agents/RobloxArchitectAgent";
import { TesterAgent } from "../../agents/agents/TesterAgent";
import { UIGeneratorAgent } from "../../agents/agents/UIGeneratorAgent";
import { LocalModelProvider } from "../../agents/providers/LocalModelProvider";

const provider = new LocalModelProvider();

const agents = [
  new OrchestratorAgent(),
  new RequirementsAgent(),
  new PlannerAgent(),
  new GameDesignerAgent(),
  new RobloxArchitectAgent(),
  new LuaGeneratorAgent(),
  new UIGeneratorAgent(),
  new AssetPlannerAgent(),
  new DatabaseAgent(),
  new DocumentationAgent(),
  new TesterAgent(),
  new DebugAgent(),
  new PerformanceAgent(),
];

export const aiOrchestrator = new Orchestrator(agents, {
  stopOnError: true,
  maxRetries: 2,
});

export async function runAgentPipeline(prompt: string) {
  return aiOrchestrator.runPipeline({
    prompt,
    pipeline: [
      "RequirementsAgent",
      "PlannerAgent",
      "GameDesignerAgent",
      "RobloxArchitectAgent",
    ],
  } as { prompt: string; pipeline: string[] });
}

export function getActiveProvider() {
  return provider;
}
