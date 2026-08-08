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
import { ArtifactStore } from "../../pipeline/v2";
import { GenerationArtifactRecorder } from "../../studio/artifacts/GenerationArtifactRecorder";
import { getConfiguredStorageProvider } from "../../platform/storage/StorageFactory";
import { GenerationOutcomeCoordinator } from "../../platform/projects/ProjectLifecycleCoordinator";

/**
 * Public-safe description of the AI provider backing this service. Carries
 * only names — never API keys, endpoints, or prompt content.
 */
export interface GenerationProviderInfo {
  /** Provider name, or null when no provider resolved. */
  provider: string | null;
  /** Model name, when a provider resolved. */
  model?: string;
}

export class GameGenerationService {
  private agentRegistry: AgentRegistry;
  private executionQueue = new ExecutionQueue();

  private repository: IBlueprintRepository;
  private cache: BlueprintCache;
  private streaming: StreamingUpdateHandler;
  private events: PipelineEventEmitter;
  private validator: BlueprintValidator;
  private artifactRecorder: GenerationArtifactRecorder;
  private outcomeCoordinator?: GenerationOutcomeCoordinator;
  private providerInfo: GenerationProviderInfo;

  constructor(
    repository: IBlueprintRepository,
    cache: BlueprintCache,
    streaming: StreamingUpdateHandler,
    events: PipelineEventEmitter,
    _integrator: unknown,
    agentRegistry?: AgentRegistry,
    artifactStore: ArtifactStore = new ArtifactStore(),
    outcomeCoordinator?: GenerationOutcomeCoordinator,
    providerInfo: GenerationProviderInfo = { provider: null },
  ) {
    this.providerInfo = providerInfo;
    this.repository = repository;
    this.cache = cache;
    this.streaming = streaming;
    this.events = events;
    this.validator = new BlueprintValidator();
    this.agentRegistry = agentRegistry ?? new AgentRegistry();
    this.artifactRecorder = new GenerationArtifactRecorder(artifactStore);
    this.outcomeCoordinator = outcomeCoordinator;
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

            await this.artifactRecorder.record(
              execution.id,
              result.graph.getAllNodes(),
            );

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

            await this.commitExecutionOutcome(execution.id, {
              status: result.success ? "completed" : "failed",
              completed_at: new Date(),
              pipeline_steps: pipelineSteps,
              total_duration_ms: result.totalDurationMs,
              ...this.resolveProvenance(result.graph.getAllNodes()),
            });
          } catch (err) {
            console.error(
              `[GameGenerationService] Pipeline failed for execution ${execution.id}:`,
              err,
            );
            await this.commitExecutionOutcome(execution.id, {
              status: "failed",
              completed_at: new Date(),
              error_message:
                err instanceof Error ? err.message : "Unknown pipeline error",
              total_duration_ms: Date.now() - execution.started_at.getTime(),
              // Provider identity only. ai_mode stays unset: a failed run
              // produced no artifacts, so its provenance is genuinely unknown.
              ...(this.providerInfo.provider
                ? { ai_provider: this.providerInfo.provider }
                : {}),
              ...(this.providerInfo.model
                ? { ai_model: this.providerInfo.model }
                : {}),
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
    return this.commitExecutionOutcome(executionId, {
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

  /**
   * Decide how this execution's content was actually produced.
   *
   * Fails safe: an execution counts as `"ai"` only when a provider resolved
   * AND no stage fell back to deterministic canned content. Anything else is
   * `"fallback"`, so a misconfigured deployment can never present a canned
   * game as an AI generation.
   */
  private resolveProvenance(
    nodes: ReadonlyArray<{ output?: unknown }>,
  ): Pick<GenerationExecution, "ai_mode" | "ai_provider" | "ai_model"> {
    const anyFallback = nodes.some(
      (node) =>
        typeof node.output === "object" &&
        node.output !== null &&
        (node.output as Record<string, unknown>)._usedFallback === true,
    );

    const usedAi = this.providerInfo.provider !== null && !anyFallback;

    return {
      ai_mode: usedAi ? "ai" : "fallback",
      ...(this.providerInfo.provider
        ? { ai_provider: this.providerInfo.provider }
        : {}),
      ...(this.providerInfo.model ? { ai_model: this.providerInfo.model } : {}),
    };
  }

  private async commitExecutionOutcome(
    executionId: string,
    updates: Partial<GenerationExecution>,
  ): Promise<GenerationExecution | null> {
    if (!this.outcomeCoordinator) {
      const configuredStorage = getConfiguredStorageProvider();
      if (configuredStorage) {
        this.outcomeCoordinator = new GenerationOutcomeCoordinator(
          configuredStorage,
        );
      }
    }

    if (!this.outcomeCoordinator) {
      return this.repository.updateExecution(executionId, updates);
    }
    return this.outcomeCoordinator.commit(executionId, updates);
  }
}
