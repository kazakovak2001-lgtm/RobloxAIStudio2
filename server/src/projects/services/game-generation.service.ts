import type { GameBlueprint, CreateBlueprintInput, GenerationExecution } from "../types/blueprint";
import type { IBlueprintRepository } from "../repository/blueprint.repository";
import { BlueprintCache } from "../cache/blueprint.cache";
import { StreamingUpdateHandler, PipelineEventEmitter } from "../../socket/streaming";
import { BlueprintValidator } from "./blueprint.validator";

export class GameGenerationService {
  private repository: IBlueprintRepository;
  private cache: BlueprintCache;
  private streaming: StreamingUpdateHandler;
  private validator: BlueprintValidator;

  constructor(
    repository: IBlueprintRepository,
    cache: BlueprintCache,
    streaming: StreamingUpdateHandler,
    _events: PipelineEventEmitter,
  ) {
    this.repository = repository;
    this.cache = cache;
    this.streaming = streaming;
    this.validator = new BlueprintValidator();
  }

  async createBlueprint(userId: string, projectId: string, input: CreateBlueprintInput): Promise<GameBlueprint> {
    const blueprint = await this.repository.createBlueprint(userId, { ...input, project_id: projectId } as CreateBlueprintInput);
    this.cache.set(projectId, blueprint);
    return blueprint;
  }

  async getBlueprint(id: string): Promise<GameBlueprint | null> {
    return this.repository.getBlueprint(id);
  }

  async getBlueprintByProject(projectId: string): Promise<GameBlueprint | null> {
    const cached = this.cache.get(projectId);
    if (cached) return cached;
    return this.repository.getBlueprintByProjectId(projectId);
  }

  async updateBlueprint(id: string, updates: Partial<GameBlueprint>): Promise<GameBlueprint | null> {
    const blueprint = await this.repository.updateBlueprint(id, updates);
    if (blueprint) {
      this.cache.set(blueprint.project_id, blueprint);
    }
    return blueprint;
  }

  validateBlueprint(blueprint: GameBlueprint) {
    return this.validator.validate(blueprint);
  }

  async startGeneration(blueprintId: string, userId: string): Promise<GenerationExecution> {
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
    return execution;
  }

  async getExecution(id: string): Promise<GenerationExecution | null> {
    return this.repository.getExecution(id);
  }

  async getExecutions(blueprintId: string): Promise<GenerationExecution[]> {
    return this.repository.listExecutions(blueprintId);
  }

  async completeGeneration(executionId: string, success: boolean): Promise<GenerationExecution | null> {
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
