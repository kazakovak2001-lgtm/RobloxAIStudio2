import type {
  GameBlueprint,
  CreateBlueprintInput,
  GenerationExecution,
} from "../types/blueprint";

import type { IBlueprintRepository } from "../repository/blueprint.repository";
import { BlueprintCache } from "../cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../../socket/streaming";
import { BlueprintValidator } from "./blueprint.validator";
import { generateGameDesignSeed } from "../../execution/gameDiversityEngine";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { ExecutionQueue } from "../../execution/executionQueue";
import { PlannerEngine } from "../../planning/core/PlannerEngine";
import { PlanExecutor } from "../../planning/execution/PlanExecutor";
import type { ArtifactStore } from "../../pipeline/v2";
import { GenerationArtifactRecorder } from "../../studio/artifacts/GenerationArtifactRecorder";

export class GameGenerationService {
  private agentRegistry: AgentRegistry;
  private executionQueue = new ExecutionQueue();

  private repository: IBlueprintRepository;
  private cache: BlueprintCache;
  private streaming: StreamingUpdateHandler;
  private events: PipelineEventEmitter;
  private validator: BlueprintValidator;
  private artifactRecorder?: GenerationArtifactRecorder;

  constructor(
    repository: IBlueprintRepository,
    cache: BlueprintCache,
    streaming: StreamingUpdateHandler,
    events: PipelineEventEmitter,
    _integrator: unknown, // preserved for backward-compatible constructor signature
    agentRegistry?: AgentRegistry,
    artifactStore?: ArtifactStore,
  ) {
    this.repository = repository;
    this.cache = cache;
    this.streaming = streaming;
    this.events = events;
    this.validator = new BlueprintValidator();
    this.agentRegistry = agentRegistry ?? new AgentRegistry();
    this.artifactRecorder = artifactStore
      ? new GenerationArtifactRecorder(artifactStore)
      : undefined;
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
    blueprintIdOrProjectId: string,
    userId: string,
  ): Promise<GenerationExecution> {
    const blueprint =
      (await this.repository.getBlueprint(blueprintIdOrProjectId)) ??
      (await this.repository.getBlueprintByProjectId(blueprintIdOrProjectId));

    if (!blueprint) {
      throw new Error(
        `Blueprint not found for id/project ${blueprintIdOrProjectId}`,
      );
    }

    const now = new Date();
    const execution: GenerationExecution = {
      id: `exec-${Date.now()}`,
      blueprint_id: blueprint.id,
      project_id: blueprint.project_id,
      user_id: userId,
      started_at: now,
      status: "running",
      retry_count: 0,
      pipeline_steps: [],
    };

    await this.repository.recordExecution(execution);

    // Defer execution until the HTTP start response and history record can be
    // committed. This also guarantees that an already-joined Socket.IO client
    // can observe pipeline.started instead of racing the request response.
    setImmediate(
      () =>
        void this.executionQueue.add(async () => {
          try {
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

            // === CANONICAL EXECUTION: PlanExecutor (single runtime) ===
            const planner = new PlannerEngine();
            const executor = new PlanExecutor(
              undefined,
              undefined,
              undefined,
              undefined,
              this.events,
            );

            const plan = planner.createPlan({
              intent: `Generate game: ${enrichedBlueprint.name}`,
              constraints: [],
              projectId: enrichedBlueprint.project_id,
              context: { blueprint: enrichedBlueprint, gameDesignSeed },
            });

            const result = await executor.executePlan(
              execution.id,
              plan.graph,
              (agent, input) =>
                this.agentRegistry.executeAgent(agent, {
                  ...input,
                  blueprint: enrichedBlueprint,
                  gameDesignSeed,
                }),
              { projectId: enrichedBlueprint.project_id, stopOnFailure: false },
            );

            // Persist the real canonical node outputs under the same durable
            // execution ID consumed by the Studio v2 snapshot/transfer path.
            this.artifactRecorder?.record(
              execution.id,
              result.graph.getAllNodes(),
            );

            // Build pipeline_steps from TaskGraph
            const pipelineSteps = result.graph.getAllNodes().map((node) => ({
              agent: node.agent,
              status:
                node.status === "done"
                  ? ("completed" as const)
                  : node.status === "failed"
                    ? ("failed" as const)
                    : ("skipped" as const),
              started_at: execution.started_at,
              completed_at: new Date(),
              duration_ms: node.durationMs,
              evaluation: node.evaluation
                ? {
                    qualityScore: node.evaluation.quality,
                    status: node.evaluation.passed
                      ? ("passed" as const)
                      : ("warning" as const),
                    issueCount: 0,
                    durationMs: 0,
                  }
                : undefined,
            }));

            await this.repository.updateExecution(execution.id, {
              status: result.success ? "completed" : "failed",
              completed_at: new Date(),
              pipeline_steps: pipelineSteps,
              total_duration_ms: result.totalDurationMs,
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
        }),
    );

    return execution;
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
