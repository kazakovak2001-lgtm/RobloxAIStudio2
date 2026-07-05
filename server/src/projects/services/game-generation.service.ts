import type {
  GameBlueprint,
  CreateBlueprintInput,
  GenerationExecution,
} from "../types/blueprint";

import type { PipelineEvent } from "../../execution/pipelineTypes";
import type { IBlueprintRepository } from "../repository/blueprint.repository";
import { BlueprintCache } from "../cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../../socket/streaming";
import { BlueprintValidator } from "./blueprint.validator";
import { AIPipelineIntegrator } from "../../execution/aiPipelineIntegrator";
import { generateGameDesignSeed } from "../../execution/gameDiversityEngine";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { ExecutionQueue } from "../../execution/executionQueue";

type StepEvaluation = {
  qualityScore: number;
  status: "passed" | "warning" | "failed";
  issueCount: number;
  durationMs: number;
};

export class GameGenerationService {
  private integrator: AIPipelineIntegrator;
  private agentRegistry: AgentRegistry;
  private executionQueue = new ExecutionQueue();
  /** Kept so startGeneration can register evaluation listeners. */
  private events: PipelineEventEmitter;

  private repository: IBlueprintRepository;
  private cache: BlueprintCache;
  private streaming: StreamingUpdateHandler;
  private validator: BlueprintValidator;

  constructor(
    repository: IBlueprintRepository,
    cache: BlueprintCache,
    streaming: StreamingUpdateHandler,
    events: PipelineEventEmitter,
    integrator: AIPipelineIntegrator,
    agentRegistry?: AgentRegistry,
  ) {
    this.repository = repository;
    this.cache = cache;
    this.streaming = streaming;
    this.events = events;
    this.validator = new BlueprintValidator();
    this.integrator = integrator;
    this.agentRegistry = agentRegistry ?? new AgentRegistry();
  }

  async createBlueprint(
    userId: string,
    projectId: string,
    input: CreateBlueprintInput,
  ): Promise<GameBlueprint> {
    const blueprint = await this.repository.createBlueprint(userId, {
      ...input,
      project_id: projectId,
    } as CreateBlueprintInput);
    this.cache.set(projectId, blueprint);
    return blueprint;
  }

  async getBlueprint(id: string): Promise<GameBlueprint | null> {
    return this.repository.getBlueprint(id);
  }

  async getBlueprintByProject(
    projectId: string,
  ): Promise<GameBlueprint | null> {
    const cached = this.cache.get(projectId);
    if (cached) return cached;
    return this.repository.getBlueprintByProjectId(projectId);
  }

  async updateBlueprint(
    id: string,
    updates: Partial<GameBlueprint>,
  ): Promise<GameBlueprint | null> {
    const blueprint = await this.repository.updateBlueprint(id, updates);
    if (blueprint) {
      this.cache.set(blueprint.project_id, blueprint);
    }
    return blueprint;
  }

  validateBlueprint(blueprint: GameBlueprint) {
    return this.validator.validate(blueprint);
  }

  async startGeneration(
    blueprintId: string,
    userId: string,
  ): Promise<GenerationExecution> {
    const now = new Date();
    const execution: GenerationExecution = {
      id: `exec-${Date.now()}`,
      blueprint_id: blueprintId,
      project_id: "",
      user_id: userId,
      started_at: now,
      status: "running",
      retry_count: 0,
      pipeline_steps: [],
    };

    await this.repository.recordExecution(execution);

    void this.executionQueue.add(async () => {
      // Collect evaluation summaries emitted by the integrator for each step.
      const evalByStep = new Map<string, StepEvaluation>();

      const evalListener = async (evt: PipelineEvent): Promise<void> => {
        if (
          (evt.type === "evaluation.completed" ||
            evt.type === "evaluation.failed") &&
          evt.stepId &&
          evt.data
        ) {
          evalByStep.set(evt.stepId, {
            qualityScore: Number(evt.data.qualityScore ?? 0),
            status: (evt.data.status as StepEvaluation["status"]) ?? "failed",
            issueCount: Number(evt.data.issueCount ?? 0),
            durationMs: Number(evt.data.durationMs ?? 0),
          });
        }
      };

      // Register before execution so we capture all evaluation events.
      this.events.onEvent(evalListener);

      try {
        const blueprint = await this.repository.getBlueprint(blueprintId);
        if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`);

        const gameDesignSeed = generateGameDesignSeed({
          blueprint,
          executionId: execution.id,
          userId,
        });

        const enrichedBlueprint: GameBlueprint = {
          ...blueprint,
          generation_metadata: {
            ...blueprint.generation_metadata,
            gameDesignSeed,
          },
        };

        const agentExecutor = async (
          agent: string,
          input: Record<string, unknown>,
        ): Promise<Record<string, unknown>> => this.runAgent(agent, input);

        const result = await this.integrator.executePipeline(
          enrichedBlueprint,
          agentExecutor,
          execution.id,
        );

        // Build pipeline_steps with evaluation summaries collected from events.
        const pipelineSteps = AIPipelineIntegrator.PIPELINE_STAGES.map(
          (stage) => {
            const inOutput =
              stage.stepId in (result.metadata.sourcePipelineOutputs ?? {});
            const evalSummary = evalByStep.get(stage.stepId);
            return {
              agent: stage.agent,
              status: inOutput ? ("completed" as const) : ("skipped" as const),
              started_at: execution.started_at,
              completed_at: new Date(),
              evaluation: evalSummary,
            };
          },
        );

        await this.repository.updateExecution(execution.id, {
          status: "completed",
          completed_at: new Date(),
          pipeline_steps: pipelineSteps,
          total_duration_ms: Date.now() - execution.started_at.getTime(),
        });
      } catch (err) {
        console.error(
          `[GameGenerationService] Pipeline failed for execution ${execution.id}:`,
          err,
        );
        await this.repository.updateExecution(execution.id, {
          status: "failed",
          completed_at: new Date(),
          error_message:
            err instanceof Error ? err.message : "Unknown pipeline error",
          total_duration_ms: Date.now() - execution.started_at.getTime(),
        });
      }
    });

    return execution;
  }

  private async runAgent(
    agentType: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.agentRegistry.executeAgent(agentType, input);
  }

  async getExecution(id: string): Promise<GenerationExecution | null> {
    return this.repository.getExecution(id);
  }

  async getExecutions(blueprintId: string): Promise<GenerationExecution[]> {
    return this.repository.listExecutions(blueprintId);
  }

  async completeGeneration(
    executionId: string,
    success: boolean,
  ): Promise<GenerationExecution | null> {
    return this.repository.updateExecution(executionId, {
      status: success ? "completed" : "failed",
      completed_at: new Date(),
    });
  }

  getStreamingHandler(): StreamingUpdateHandler {
    return this.streaming;
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}
