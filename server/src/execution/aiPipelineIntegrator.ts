import type { PipelineEvent } from "./pipelineTypes";
import type { GameBlueprint, GameDesignSeed } from "../types/blueprint";
import { PipelineEventEmitter } from "../socket/streaming";
import type { GameGenerationResult } from "../types/game-generation-result";
import { aggregateToGameGenerationResult } from "./gameGenerationResultAggregator";

type AgentExecutor = (
  agent: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export class AIPipelineIntegrator {
  constructor(private readonly events: PipelineEventEmitter) {}

  async executePipeline(
    blueprint: GameBlueprint,
    agentExecutor: AgentExecutor,
    executionId: string,
    _mode: "sequential" | "parallel" | "hybrid" = "sequential",
  ): Promise<GameGenerationResult> {
    console.log("AI PATCH MODE ACTIVE - DIRECT WRITE ENABLED");

    // Minimal sequential stage list (restoring missing orchestration).
    // If later a real stage graph is discovered, this list can be replaced.
    const stages: Array<{ agent: string; stepId: string }> = [
      { agent: "requirements", stepId: "requirements" },
      { agent: "planner", stepId: "planner" },
      { agent: "game_designer", stepId: "game_designer" },
      { agent: "roblox_architect", stepId: "roblox_architect" },
      { agent: "lua_generator", stepId: "lua_generator" },
      { agent: "ui_generator", stepId: "ui_generator" },
      { agent: "asset_planner", stepId: "asset_planner" },
      { agent: "orchestrator", stepId: "final" },
    ];

    // We use executionId as pipelineId everywhere.
    const pipelineId = executionId;

    await this.events.emit({
      type: "pipeline.started",
      pipelineId,
      timestamp: new Date(),
    });

    let pipelineOutputs: Record<string, unknown> = {};

    try {
      for (const stage of stages) {
        await this.events.emit({
          type: "step.started",
          pipelineId,
          stepId: stage.stepId,
          data: { name: stage.agent },
          timestamp: new Date(),
        });

        // Pass blueprint metadata + accumulated outputs to each agent.
        // Reuses the existing agentExecutor(agentType, input) pattern.
        const input: Record<string, unknown> = {
          blueprint,
          executionId,
          ...pipelineOutputs,
        };

        // Backward-compatible context injection for diversity (design-intelligence layer).
        // (No contract changes; existing agents ignore unknown fields.)
        if (blueprint.generation_metadata?.gameDesignSeed) {
          const seed = blueprint.generation_metadata.gameDesignSeed as GameDesignSeed;
          (input as Record<string, unknown>).gameDesignSeed = seed;
        }

        const output = await agentExecutor(stage.agent, input);
        pipelineOutputs = { ...pipelineOutputs, [stage.stepId]: output };

        await this.events.emit({
          type: "step.completed",
          pipelineId,
          stepId: stage.stepId,
          data: { output },
          timestamp: new Date(),
        });
      }

      await this.events.emit({
        type: "pipeline.completed",
        pipelineId,
        data: { outputs: pipelineOutputs },
        timestamp: new Date(),
      });

      // Deterministic final aggregation into canonical game artifact.
      const result = aggregateToGameGenerationResult(pipelineOutputs, {
        blueprint,
        executionId,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pipeline failed";

      // Best-effort: emit pipeline failure (event flow unchanged).
      await this.events.emit({
        type: "pipeline.failed",
        pipelineId,
        data: { error: message },
        timestamp: new Date(),
      });

      // Return a deterministic, structured fallback (no raw unstructured final output).
      return {
        scripts: { server: [], client: [], shared: [] },
        world: {
          name: undefined,
          description: undefined,
          places: undefined,
          models: undefined,
          systemsHooks: { error: message },
        },
        npcs: [],
        gameplaySystems: { systems: [] },
        metadata: {
          executionId,
          blueprintId: blueprint.id,
          generatedAt: new Date(),
          agentsInvolved: [
            "requirements",
            "planner",
            "game_designer",
            "roblox_architect",
            "lua_generator",
            "ui_generator",
            "asset_planner",
            "orchestrator",
          ],
          sourcePipelineOutputs: pipelineOutputs,
        },
        blueprint,
      };
    }
  }

  async emit(event: PipelineEvent): Promise<void> {
    await this.events.emit(event);
  }
}
