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
 import { AIPipelineIntegrator } from "../../execution/aiPipelineIntegrator";
 import { generateGameDesignSeed } from "../../execution/gameDiversityEngine";

export class GameGenerationService {
  private integrator: AIPipelineIntegrator;

  private repository: IBlueprintRepository;
  private cache: BlueprintCache;
  private streaming: StreamingUpdateHandler;
  private validator: BlueprintValidator;

  constructor(
    repository: IBlueprintRepository,
    cache: BlueprintCache,
    streaming: StreamingUpdateHandler,
    _events: PipelineEventEmitter,
    integrator: AIPipelineIntegrator,
  ) {
    this.repository = repository;
    this.cache = cache;
    this.streaming = streaming;
    this.validator = new BlueprintValidator();
    this.integrator = integrator;
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

    // Trigger real pipeline execution after creation.
    // Uses existing agentExecutor(agentType, input) pattern.
    const run = async () => {
      const blueprint = await this.repository.getBlueprint(blueprintId);
      if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`);

      // Generate diversity-aware GameDesignSeed and inject into blueprint
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

      // Minimal agent executor adapter using existing infrastructure.
      const agentExecutor = async (
        agent: string,
        input: Record<string, unknown>,
      ): Promise<Record<string, unknown>> => {
        // The step runner expects agent outputs as plain records.
        // Agent implementations are expected to be exposed via provider elsewhere.
        // For now we reuse the pipeline's sequential loop contract.
        // This repository adapter relies on the agent system being wired at runtime.
        return this.runAgent(agent, input);
      };

      return this.integrator.executePipeline(
        enrichedBlueprint,
        agentExecutor,
        execution.id,
      );
    };

    // Ensure it is async but guaranteed to start.
    void run().catch((err) => {
      console.error("Pipeline execution failed:", err);
    });

    return execution;
  }

  // Adapter hook: reuse existing agent execution wiring if present.
  // If agent execution isn't wired in this repo, integrator will still emit events but agent steps may fail.
  private async runAgent(
    agentType: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await (this as any).agentExecutor?.executeAgent?.(
      agentType,
      input,
    );
    if (result && typeof result === "object")
      return result as Record<string, unknown>;
    return { result };
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
