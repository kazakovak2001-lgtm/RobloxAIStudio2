import type { LLMProvider } from "../../ai/provider";
import type { BaseAgent } from "./BaseAgent";
import { getAgentDefinition } from "../contract/agentContract";
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
import { ArchitectureControllerAgent } from "../implementations/ArchitectureControllerAgent";
import { CodeReviewControllerAgent } from "../implementations/CodeReviewControllerAgent";
import { DuplicationDetectionAgent } from "../implementations/DuplicationDetectionAgent";

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

    // AI Project Controller agents
    this.register("architecture_controller", new ArchitectureControllerAgent());
    this.register("code_review_controller", new CodeReviewControllerAgent());
    this.register("duplication_detector", new DuplicationDetectionAgent());

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
   *
   * Output produced by a deterministic fallback rather than a model is tagged
   * `_usedFallback: true`, following the same `_`-prefixed marker convention
   * as `_failed` / `_skipped`. Callers must not present tagged output as an
   * AI generation.
   */
  async executeAgent(
    agentType: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // AGENT-CONTRACT-1. An agent with no definition is refused before any
    // provider is invoked: nothing states what it produces, so nothing
    // downstream could judge what came back.
    const definition = getAgentDefinition(agentType);
    if (!definition) {
      return {
        _failed: true,
        _error: `No agent definition for "${agentType}"`,
        _agent: agentType,
      };
    }

    const agent = this.agents.get(agentType);
    if (!agent) {
      return { _skipped: true, _reason: `Unknown agent type: ${agentType}` };
    }

    // A definition that requires a model must not be satisfied by canned
    // content. Checked before execution so the refusal is about policy rather
    // than about whatever the fallback happened to produce.
    if (definition.model.requiresModel && !agent.hasLLM()) {
      return {
        _failed: true,
        _error: `Agent "${agentType}" requires a model provider and none is configured`,
        _agent: agentType,
      };
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

    const data = (result.data as Record<string, unknown>) ?? {};
    if (!result.usedFallback) return data;

    // A definition that forbids deterministic content must not have it pass
    // silently. PROVIDER-1B's marker stays on output that is allowed through,
    // so provenance is unchanged for every agent that permits fallback.
    if (definition.model.fallback === "forbidden") {
      return {
        _failed: true,
        _error: `Agent "${agentType}" produced deterministic fallback content, which its definition forbids`,
        _agent: agentType,
      };
    }
    return { ...data, _usedFallback: true };
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
