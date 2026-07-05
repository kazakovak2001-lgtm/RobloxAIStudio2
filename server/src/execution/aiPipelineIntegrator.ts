import type { PipelineEvent } from "./pipelineTypes";
import type { GameBlueprint, GameDesignSeed } from "../types/blueprint";
import { PipelineEventEmitter } from "../socket/streaming";
import type { GameGenerationResult } from "../types/game-generation-result";
import { aggregateToGameGenerationResult } from "./gameGenerationResultAggregator";
import {
  EvaluationRegistry,
  getDefaultEvaluationRegistry,
} from "../evaluation/EvaluationRegistry";
import type { EvaluationResult } from "../evaluation/EvaluationResult";

type AgentExecutor = (
  agent: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * Step execution result for internal tracking.
 * Now includes the evaluation result produced after each agent.
 */
interface StepResult {
  stepId: string;
  agent: string;
  status: "completed" | "failed" | "skipped";
  output: Record<string, unknown>;
  durationMs: number;
  error?: string;
  evaluation?: EvaluationResult;
}

/**
 * AIPipelineIntegrator
 *
 * Drives the sequential agent pipeline for game generation.
 * After each agent completes, the output is evaluated by EvaluationRegistry.
 * If evaluation status is "failed", the pipeline short-circuits.
 *
 * Flow per stage:
 *   agentExecutor(stage, input)
 *     → evaluation.started  (SSE)
 *     → EvaluationRegistry.evaluate()
 *     → evaluation.completed / evaluation.failed  (SSE)
 *     → step.completed / step.failed  (SSE)
 *     → continue / abort
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

  private evaluationRegistry: EvaluationRegistry;

  constructor(
    private readonly events: PipelineEventEmitter,
    evaluationRegistry?: EvaluationRegistry,
  ) {
    this.evaluationRegistry =
      evaluationRegistry ?? getDefaultEvaluationRegistry();
  }

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

        // Build agent input: blueprint + seed + accumulated flat outputs
        const input: Record<string, unknown> = {
          blueprint,
          executionId,
          ...pipelineOutputs,
        };

        if (blueprint.generation_metadata?.gameDesignSeed) {
          input.gameDesignSeed = blueprint.generation_metadata
            .gameDesignSeed as GameDesignSeed;
        }

        // ── Agent execution ──────────────────────────────────────────────
        let output: Record<string, unknown>;
        try {
          output = await agentExecutor(stage.agent, input);
        } catch (agentErr) {
          const errMsg =
            agentErr instanceof Error ? agentErr.message : "Agent threw";
          output = { _failed: true, _error: errMsg, _agent: stage.agent };
        }

        const agentDurationMs = Date.now() - stepStart;

        // ── Evaluation ───────────────────────────────────────────────────
        await this.events.emit({
          type: "evaluation.started",
          pipelineId,
          stepId: stage.stepId,
          data: { agentType: stage.stepId },
          timestamp: new Date(),
        });

        const evalResult = this.evaluationRegistry.evaluate(
          stage.stepId,
          output,
        );

        const evalEventType =
          evalResult.status === "failed"
            ? "evaluation.failed"
            : "evaluation.completed";

        await this.events.emit({
          type: evalEventType,
          pipelineId,
          stepId: stage.stepId,
          data: {
            agentType: stage.stepId,
            qualityScore: evalResult.qualityScore,
            status: evalResult.status,
            issueCount: evalResult.issues.length,
            durationMs: evalResult.durationMs,
            issues: evalResult.issues,
            recommendations: evalResult.recommendations,
          },
          timestamp: new Date(),
        });

        // Treat agent _failed marker OR evaluation "failed" as pipeline abort
        const agentFailed = output._failed === true;
        const evalFailed = evalResult.status === "failed";

        if (agentFailed || evalFailed) {
          const errorMsg = agentFailed
            ? typeof output._error === "string"
              ? output._error
              : "Agent execution failed"
            : `Evaluation failed for ${stage.agent}: score=${evalResult.qualityScore}`;

          stepResults.push({
            stepId: stage.stepId,
            agent: stage.agent,
            status: "failed",
            output,
            durationMs: agentDurationMs,
            error: errorMsg,
            evaluation: evalResult,
          });

          await this.events.emit({
            type: "step.failed",
            pipelineId,
            stepId: stage.stepId,
            data: { error: errorMsg, evaluation: evalResult },
            timestamp: new Date(),
          });

          pipelineOutputs = { ...pipelineOutputs, [stage.stepId]: output };

          throw new Error(
            `Stage "${stage.agent}" (${stage.stepId}) failed: ${errorMsg}`,
          );
        }

        // ── Success ──────────────────────────────────────────────────────
        pipelineOutputs = {
          ...pipelineOutputs,
          ...output,
          [stage.stepId]: output,
        };

        stepResults.push({
          stepId: stage.stepId,
          agent: stage.agent,
          status: "completed",
          output,
          durationMs: agentDurationMs,
          evaluation: evalResult,
        });

        await this.events.emit({
          type: "step.completed",
          pipelineId,
          stepId: stage.stepId,
          data: {
            output,
            durationMs: agentDurationMs,
            evaluation: {
              qualityScore: evalResult.qualityScore,
              status: evalResult.status,
            },
          },
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

  /**
   * Expose step results with evaluation data for the service layer to
   * persist onto GenerationExecution.pipeline_steps.
   */
  getLastStepResults(): ReadonlyArray<StepResult> {
    // Note: stepResults is local to executePipeline; service receives them
    // via the pipeline.completed / pipeline.failed event data.
    return [];
  }

  async emit(event: PipelineEvent): Promise<void> {
    await this.events.emit(event);
  }
}
