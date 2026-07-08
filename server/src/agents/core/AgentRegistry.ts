import type { LLMProvider } from "../../ai/provider";
import type { BaseAgent } from "./BaseAgent";
import { RequirementsAgent } from "../implementations/RequirementsAgent";
import { PlannerAgent } from "../implementations/PlannerAgent";
import { GameDesignerAgent } from "../implementations/GameDesignerAgent";
import { RobloxArchitectAgent } from "../implementations/RobloxArchitectAgent";
import { LuaGeneratorAgent } from "../implementations/LuaGeneratorAgent";
import { UIGeneratorAgent } from "../implementations/UIGeneratorAgent";
import { AssetPlannerAgent } from "../implementations/AssetPlannerAgent";
import { DatabaseAgent } from "../implementations/DatabaseAgent";
import { DocumentationAgent } from "../implementations/DocumentationAgent";
import { TesterAgent } from "../implementations/TesterAgent";
import { DebugAgent } from "../implementations/DebugAgent";
import { PerformanceAgent } from "../implementations/PerformanceAgent";
import { OrchestratorAgent } from "../implementations/OrchestratorAgent";

/**
 * AgentRegistry
 *
 * Single source of truth for agent instantiation in the pipeline.
 * Agents are created once and optionally wired with an LLM provider.
 * The OrchestratorAgent instance is also given a reference to the registry
 * so its Mode B (coordination) path can delegate to other agents.
 */
export class AgentRegistry {
  private agents = new Map<string, BaseAgent>();

  constructor(llm?: LLMProvider) {
    this.register("requirements", new RequirementsAgent());
    this.register("planner", new PlannerAgent());
    this.register("game_designer", new GameDesignerAgent());
    this.register("roblox_architect", new RobloxArchitectAgent());
    this.register("lua_generator", new LuaGeneratorAgent());
    this.register("ui_generator", new UIGeneratorAgent());
    this.register("asset_planner", new AssetPlannerAgent());
    this.register("database_designer", new DatabaseAgent());
    this.register("documentation", new DocumentationAgent());
    this.register("tester", new TesterAgent());
    this.register("debugger", new DebugAgent());
    this.register("performance", new PerformanceAgent());

    // OrchestratorAgent is created last so the registry reference below is valid.
    const orchestrator = new OrchestratorAgent();
    orchestrator.setRegistry(this);
    this.register("orchestrator", orchestrator);

    if (llm) {
      this.setLLM(llm);
    }
  }

  private register(type: string, agent: BaseAgent): void {
    this.agents.set(type, agent);
  }

  /**
   * Wire an LLM provider into every registered agent.
   * Agents that don't use LLM ignore it silently.
   */
  setLLM(llm: LLMProvider): void {
    for (const agent of this.agents.values()) {
      agent.setLLM(llm);
    }
  }

  /**
   * Execute a named agent with the given input.
   * Returns the agent's output record, or a structured error record on failure.
   */
  async executeAgent(
    agentType: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const agent = this.agents.get(agentType);
    if (!agent) {
      return { _skipped: true, _reason: `Unknown agent type: ${agentType}` };
    }

    const result = await agent.execute(input);

    if (!result.success) {
      return {
        _failed: true,
        _error: result.error ?? "Agent execution failed",
        _agent: agentType,
        _attempts: result.attempts,
      };
    }

    return (result.data as Record<string, unknown>) ?? {};
  }

  /**
   * Resolve an agent instance by type (read-only access).
   */
  getAgent(agentType: string): BaseAgent | undefined {
    return this.agents.get(agentType);
  }

  /**
   * List all registered agent type keys.
   */
  registeredTypes(): string[] {
    return Array.from(this.agents.keys());
  }
}
