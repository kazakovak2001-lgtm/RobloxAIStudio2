import type { PipelineEvent } from "./pipelineTypes";
import type { GameBlueprint, GameDesignSeed } from "../types/blueprint";
import { PipelineEventEmitter } from "../socket/streaming";
import type { GameGenerationResult } from "../types/game-generation-result";
import { aggregateToGameGenerationResult } from "./gameGenerationResultAggregator";

type AgentExecutor = (
  agent: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * Step execution result for internal tracking.
 */
interface StepResult {
  stepId: string;
  agent: string;
  status: "completed" | "failed" | "skipped";
  output: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

/**
 * AIPipelineIntegrator
 *
 * Drives the sequential agent pipeline for game generation.
 * Responsibilities:
 *  - Emits lifecycle events (pipeline.started, step.started/completed/failed, pipeline.completed/failed)
 *  - Passes accumulated prior-step outputs to each agent as flat context
 *  - Short-circuits on agent failure (does not continue after a failed step)
 *  - Returns a deterministic GameGenerationResult regardless of success or failure
 */
export class AIPipelineIntegrator {
  /** Ordered stage definitions for the core generation pipeline. */
  static readonly PIPELINE_STAGES: ReadonlyArray<{
    agent: string;
    stepId: string;
  }> = [
    { agent: "requirements", stepId: "requirements" },
    { agent: "planner", stepId: "planner" },
    { agent: "game_designer", stepId: "game_designer" },
    { agent: "roblox_architect", stepId: "roblox_architect" },
    { agent: "lua_generator", stepId: "lua_generator" },
    { agent: "ui_generator", stepId: "ui_generator" },
    { agent: "asset_planner", stepId: "asset_planner" },
    { agent: "orchestrator", stepId: "final" },
  ];

  constructor(private readonly events: PipelineEventEmitter) {}

  async executePipeline(
    blueprint: GameBlueprint,
    agentExecutor: AgentExecutor,
    executionId: string,
    _mode: "sequential" | "parallel" | "hybrid" = "sequential",
  ): Promise<GameGenerationResult> {
    const pipelineId = executionId;

    await this.events.emit({
      type: "pipeline.started",
      pipelineId,
      timestamp: new Date(),
    });

    /**
     * pipelineOutputs stores each step's output under its stepId key for the
     * aggregator, and also spreads the output's own keys flat so that
     * downstream agents can reference them directly (e.g. a GameDesigner
     * reading `input.requirements` rather than `input.requirements.requirements`).
     */
    let pipelineOutputs: Record<string, unknown> = {};
    const stepResults: StepResult[] = [];

    try {
      for (const stage of AIPipelineIntegrator.PIPELINE_STAGES) {
        const stepStart = Date.now();

        await this.events.emit({
          type: "step.started",
          pipelineId,
          stepId: stage.stepId,
          data: { name: stage.agent },
          timestamp: new Date(),
        });

        // Build agent input: blueprint + seed context + all flat accumulated outputs.
        const input: Record<string, unknown> = {
          blueprint,
          executionId,
          ...pipelineOutputs,
        };

        if (blueprint.generation_metadata?.gameDesignSeed) {
          input.gameDesignSeed = blueprint.generation_metadata
            .gameDesignSeed as GameDesignSeed;
        }

        let output: Record<string, unknown>;
        try {
          output = await agentExecutor(stage.agent, input);
        } catch (agentErr) {
          const errMsg =
            agentErr instanceof Error ? agentErr.message : "Agent threw";
          output = { _failed: true, _error: errMsg, _agent: stage.agent };
        }

        const durationMs = Date.now() - stepStart;
        const stepFailed = output._failed === true;

        if (stepFailed) {
          const errorMsg =
            typeof output._error === "string"
              ? output._error
              : "Agent execution failed";

          stepResults.push({
            stepId: stage.stepId,
            agent: stage.agent,
            status: "failed",
            output,
            durationMs,
            error: errorMsg,
          });

          await this.events.emit({
            type: "step.failed",
            pipelineId,
            stepId: stage.stepId,
            data: { error: errorMsg },
            timestamp: new Date(),
          });

          // Store the failed step output under its stepId so the aggregator
          // can still reference partial results, then abort the pipeline.
          pipelineOutputs = {
            ...pipelineOutputs,
            [stage.stepId]: output,
          };

          throw new Error(
            `Stage "${stage.agent}" (${stage.stepId}) failed: ${errorMsg}`,
          );
        }

        // Success: store under stepId for aggregator AND spread output keys
        // flat so the next agent receives domain keys directly (e.g. `requirements`,
        // `plan`, `gameplay`) without additional nesting.
        pipelineOutputs = {
          ...pipelineOutputs, // prior accumulated flat keys
          ...output, // this agent's output keys (flat, domain-level)
          [stage.stepId]: output, // keyed copy for aggregator lookup
        };

        stepResults.push({
          stepId: stage.stepId,
          agent: stage.agent,
          status: "completed",
          output,
          durationMs,
        });

        await this.events.emit({
          type: "step.completed",
          pipelineId,
          stepId: stage.stepId,
          data: { output, durationMs },
          timestamp: new Date(),
        });
      }

      await this.events.emit({
        type: "pipeline.completed",
        pipelineId,
        data: { outputs: pipelineOutputs, steps: stepResults },
        timestamp: new Date(),
      });

      return aggregateToGameGenerationResult(pipelineOutputs, {
        blueprint,
        executionId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pipeline failed";

      await this.events.emit({
        type: "pipeline.failed",
        pipelineId,
        data: { error: message, steps: stepResults },
        timestamp: new Date(),
      });

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
          agentsInvolved: AIPipelineIntegrator.PIPELINE_STAGES.map(
            (s) => s.agent,
          ),
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
