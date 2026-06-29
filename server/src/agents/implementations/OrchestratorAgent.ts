import type { AgentInput, AgentOutput, AgentStatus, AgentType } from "../../types";
import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import { RequirementsAgent } from "./RequirementsAgent";
import { PlannerAgent } from "./PlannerAgent";
import { GameDesignerAgent } from "./GameDesignerAgent";
import { RobloxArchitectAgent } from "./RobloxArchitectAgent";
import { LuaGeneratorAgent } from "./LuaGeneratorAgent";
import { UIGeneratorAgent } from "./UIGeneratorAgent";
import { AssetPlannerAgent } from "./AssetPlannerAgent";
import { DatabaseAgent } from "./DatabaseAgent";
import { DocumentationAgent } from "./DocumentationAgent";
import { TesterAgent } from "./TesterAgent";
import { DebugAgent } from "./DebugAgent";
import { PerformanceAgent } from "./PerformanceAgent";

const agentFactories: Record<string, () => BaseAgent> = {
  requirements: () => new RequirementsAgent(),
  planner: () => new PlannerAgent(),
  game_designer: () => new GameDesignerAgent(),
  roblox_architect: () => new RobloxArchitectAgent(),
  lua_generator: () => new LuaGeneratorAgent(),
  ui_generator: () => new UIGeneratorAgent(),
  asset_planner: () => new AssetPlannerAgent(),
  database_designer: () => new DatabaseAgent(),
  documentation: () => new DocumentationAgent(),
  tester: () => new TesterAgent(),
  debugger: () => new DebugAgent(),
  performance: () => new PerformanceAgent(),
  orchestrator: () => { throw new Error("Orchestrator cannot be instantiated as a pipeline agent"); },
};

export class OrchestratorAgent extends BaseAgent {
  public readonly name = "Orchestrator";
  public readonly description = "Coordinates the multi-agent pipeline execution with retry, logging, and error handling.";
  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      pipeline: { type: "array", items: { type: "string" } },
      input: { type: "object" },
    },
    required: ["pipeline", "input"],
  };
  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      pipelineRunId: { type: "string" },
      status: { type: "string" },
      steps: { type: "array", items: { type: "object" } },
      finalOutput: { type: "object" },
    },
    required: ["pipelineRunId", "status", "steps"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<AgentOutput> {
    const pipeline = input.pipeline as AgentType[];
    const userInput = input.input as AgentInput;
    const pipelineRunId = `run_${Date.now()}`;

    const steps: Array<{
      agent: string;
      status: AgentStatus;
      startedAt: Date;
      finishedAt?: Date;
    }> = [];

    let currentInput: AgentInput = userInput;

    for (const agentType of pipeline) {
      const factory = agentFactories[agentType];
      if (!factory) {
        steps.push({ agent: agentType, status: "failed", startedAt: new Date(), finishedAt: new Date() });
        break;
      }

      const agent = factory();
      const startedAt = new Date();
      const result = await agent.execute(currentInput);
      steps.push({
        agent: agent.name,
        status: result.success ? "completed" : "failed",
        startedAt,
        finishedAt: new Date(),
      });

      if (!result.success) {
        break;
      }

      currentInput = { ...currentInput, ...(result.data ?? {}) };
    }

    const completedSteps = steps.filter((step) => step.status === "completed");
    const status = steps.some((s) => s.status === "failed") ? "failed" : "completed";

    return {
      pipelineRunId,
      status,
      steps: steps.map((s) => ({ agent: s.agent, status: s.status, startedAt: s.startedAt.toISOString(), finishedAt: s.finishedAt?.toISOString() })),
      finalOutput: completedSteps.length > 0 ? currentInput : {},
    };
  }
}
