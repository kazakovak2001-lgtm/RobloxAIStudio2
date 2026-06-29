import { OrchestratorAgent } from "./agents/OrchestratorAgent";
import { RequirementsAgent } from "./agents/RequirementsAgent";
import { PlannerAgent } from "./agents/PlannerAgent";
import { GameDesignerAgent } from "./agents/GameDesignerAgent";
import { RobloxArchitectAgent } from "./agents/RobloxArchitectAgent";
import { LuaGeneratorAgent } from "./agents/LuaGeneratorAgent";
import { UIGeneratorAgent } from "./agents/UIGeneratorAgent";
import { AssetPlannerAgent } from "./agents/AssetPlannerAgent";
import { DatabaseAgent } from "./agents/DatabaseAgent";
import { DocumentationAgent } from "./agents/DocumentationAgent";
import { TesterAgent } from "./agents/TesterAgent";
import { DebugAgent } from "./agents/DebugAgent";
import { PerformanceAgent } from "./agents/PerformanceAgent";
import { Orchestrator } from "./orchestrator/Orchestrator";
import { LocalModelProvider } from "./providers/LocalModelProvider";

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

const orchestrator = new Orchestrator(agents, {
  stopOnError: true,
  maxRetries: 2,
});

export async function runAgentPipeline(prompt: string) {
  return orchestrator.runPipeline({
    prompt,
    pipeline: [
      "RequirementsAgent",
      "PlannerAgent",
      "GameDesignerAgent",
      "RobloxArchitectAgent",
    ],
  });
}

void runAgentPipeline(
  "Create a Roblox mining simulator with pets and rebirths"
).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});
