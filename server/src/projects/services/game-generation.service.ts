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
import { getAgentDefinition } from "../../agents/contract/agentContract";
import { ExecutionQueue } from "../../execution/executionQueue";
import { PlannerEngine } from "../../planning/core/PlannerEngine";
import { PlanExecutor } from "../../planning/execution/PlanExecutor";
import { ArtifactStore, resolveRepairAncestry } from "../../pipeline/v2";
import { deriveNoveltyVerdict } from "../../validation/noveltyVerdict";
import type { GameDnaReport } from "../../validation/gameDna";
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
  private artifactStore: ArtifactStore;
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
    this.artifactStore = artifactStore;
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

  /**
   * AUDIT-START-ATOMICITY-001.
   *
   * Resolve the blueprint and build the execution record **without** persisting
   * it and without starting any process-local work. Split out of
   * `startGeneration` so a caller that must commit the execution together with
   * other durable evidence — project state and start history — can put all
   * three in one `applyDurableBatch` instead of three independent writes.
   *
   * Nothing here is durable, so a rejection leaves no state behind.
   */
  async prepareGeneration(
    blueprintIdOrProjectId: string,
    userId: string,
  ): Promise<{ execution: GenerationExecution; blueprint: GameBlueprint }> {
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

    return { execution, blueprint };
  }

  /**
   * Persist the execution on its own and start it. Unchanged contract for
   * callers that do not need the execution to share a transaction with other
   * durable evidence.
   */
  async startGeneration(
    blueprintIdOrProjectId: string,
    userId: string,
  ): Promise<GenerationExecution> {
    const { execution, blueprint } = await this.prepareGeneration(
      blueprintIdOrProjectId,
      userId,
    );

    await this.repository.recordExecution(execution);
    this.enqueueGeneration(execution, blueprint, userId);
    return execution;
  }

  /**
   * Start the process-local pipeline for an execution that is already durable.
   *
   * Deliberately not async and deliberately last: it must only run after the
   * durable start evidence has committed, so a failed commit never leaves a
   * pipeline running for state that was rolled back.
   */
  enqueueGeneration(
    execution: GenerationExecution,
    blueprint: GameBlueprint,
    userId: string,
  ): void {
    setImmediate(
      () =>
        void this.executionQueue.add(async () => {
          // Held outside the try so a run that fails after planning still
          // records which pipeline it was running. It stays empty only when
          // planning itself never produced a plan, where the shape genuinely
          // is unknown.
          let pipelineProvenance: Pick<
            GenerationExecution,
            "pipeline_definition" | "pipeline_version"
          > = {};
          // Held outside the try for the same reason. A run that fails after
          // its agents ran still knows how their content was produced, and
          // that is exactly when mislabelling it would be worst.
          let executedNodes: ReadonlyArray<{ output?: unknown }> = [];
          // GEN-FAILURE-EVIDENCE-001. Held outside the try for the same
          // reason as the two above: a run that fails after its agents ran
          // still knows which steps completed, failed and were skipped, and
          // that is exactly the run whose evidence used to be dropped.
          let pipelineSteps: GenerationExecution["pipeline_steps"] = [];

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

            pipelineProvenance = {
              pipeline_definition: plan.definitionId,
              pipeline_version: plan.definitionVersion,
            };

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

            // Only nodes that actually produced content. `getAllNodes()`
            // includes failed and skipped ones, so counting those would let a
            // run whose first agent failed — producing nothing at all — be
            // labelled `ai` on the strength of a configured provider and the
            // absence of a fallback marker that nothing was there to set.
            executedNodes = result.graph
              .getAllNodes()
              .filter(
                (node) => node.status === "done" && node.output !== undefined,
              );

            // ARTIFACT-CONTRACT-2. Ownership comes from the blueprint the
            // server already resolved, never from generated content and never
            // from the request.
            const recordedArtifacts = await this.artifactRecorder.record(
              execution.id,
              result.graph.getAllNodes(),
              enrichedBlueprint.project_id,
            );

            pipelineSteps = result.graph.getAllNodes().map((node) => {
              const status =
                node.status === "done"
                  ? ("completed" as const)
                  : node.status === "failed"
                    ? ("failed" as const)
                    : ("skipped" as const);
              // AGENT-CONTRACT-1. Which definition ran, recorded per step so a
              // later contract change cannot be read backwards onto this run.
              // A skipped node never reached its agent, so no definition ran
              // for it and claiming one would be provenance about nothing.
              const definition =
                status === "skipped"
                  ? undefined
                  : getAgentDefinition(node.agent);
              return {
                agent: node.agent,
                ...(definition ? { agent_version: definition.version } : {}),
                status,
                started_at: execution.started_at,
                completed_at: new Date(),
                duration_ms: node.durationMs,
                // Carries both a failure message and the reason a node never
                // ran, so a partial pipeline says why rather than just how far.
                ...(node.error ? { error: node.error } : {}),
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
              };
            });

            await this.commitExecutionOutcome(execution.id, {
              status: result.success ? "completed" : "failed",
              completed_at: new Date(),
              pipeline_steps: pipelineSteps,
              total_duration_ms: result.totalDurationMs,
              ...pipelineProvenance,
              ...this.resolveProvenance(result.graph.getAllNodes()),
              ...this.resolveNovelty(execution.id, recordedArtifacts),
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
              // GEN-FAILURE-EVIDENCE-001. The success path recorded which steps
              // ran; this path did not, and the coordinator falls back to the
              // record's existing steps, which are the empty array written at
              // start. A run whose recorder or validation failed after six
              // agents therefore reported nothing completed, nothing failed and
              // nothing known. It stays empty only when the failure came before
              // any step was derived, where the shape genuinely is unknown.
              pipeline_steps: pipelineSteps,
              ...pipelineProvenance,
              // How the content was produced is knowable whenever the agents
              // ran, even though the run failed afterwards — and `ai` still
              // requires a provider and no fallback anywhere, so this can only
              // ever under-claim. Before any agent ran there is nothing to
              // judge, and `ai_mode` stays unset rather than guessing.
              ...(executedNodes.length > 0
                ? this.resolveProvenance(executedNodes)
                : {
                    ...(this.providerInfo.provider
                      ? { ai_provider: this.providerInfo.provider }
                      : {}),
                    ...(this.providerInfo.model
                      ? { ai_model: this.providerInfo.model }
                      : {}),
                  }),
            });
          }
        }),
    );
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

  /**
   * NOVELTY-2. Turn this run's structural evidence into one verdict.
   *
   * Returns nothing at all when no `GAME_DNA` artifact was recorded — a run
   * that produced no fingerprint has not been found distinct, it has not been
   * asked, and an absent field says that where a `distinct` verdict would lie.
   *
   * Never throws. The verdict is advisory, and a generation that already
   * passed deterministic validation must not fail because a judgement about
   * its structure could not be formed.
   */
  private resolveNovelty(
    executionId: string,
    artifacts: readonly { stage: string; content: unknown }[],
  ): Pick<GenerationExecution, "novelty"> {
    try {
      const dna = artifacts.find((artifact) => artifact.stage === "GAME_DNA");
      if (!dna) return {};

      const report = dna.content as GameDnaReport;
      if (!report || typeof report.fingerprint !== "string") return {};

      // Ancestry from durable lineage, never from the execution id: a
      // repaired run legitimately shares its parent's structure, and reading
      // the `-repair-` naming convention would make that judgement depend on
      // a string nothing enforces.
      const ancestry = resolveRepairAncestry(this.artifactStore, executionId);

      return {
        novelty: deriveNoveltyVerdict({
          report,
          ancestors: ancestry.ancestors,
          ancestryResolved: ancestry.resolved,
        }),
      };
    } catch {
      // No verdict rather than a guessed one.
      return {};
    }
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

    const committed = this.outcomeCoordinator
      ? await this.outcomeCoordinator.commit(executionId, updates)
      : await this.repository.updateExecution(executionId, updates);

    // GEN-LIFECYCLE-SPLIT-001. This is the only point at which a generation is
    // finished in the canonical sense: the artifacts are recorded, validation
    // has run, and the outcome is durably committed. `pipeline.completed` fires
    // earlier and only means the agent DAG finished, so a consumer that treats
    // it as completion can show a finished run for a generation that then
    // failed. Emitted here, from one place, so both the success and the failure
    // path announce the same truth as the record they just wrote.
    if (committed) {
      await this.emitTerminalGenerationEvent(committed);
    }
    return committed;
  }

  private async emitTerminalGenerationEvent(
    execution: GenerationExecution,
  ): Promise<void> {
    try {
      await this.events.emit({
        type:
          execution.status === "completed"
            ? "generation.completed"
            : "generation.failed",
        pipelineId: execution.id,
        projectId: execution.project_id,
        timestamp: execution.completed_at ?? new Date(),
        data: {
          executionId: execution.id,
          status: execution.status,
          ...(execution.error_message
            ? { error: execution.error_message }
            : {}),
          completedSteps: execution.pipeline_steps.filter(
            (step) => step.status === "completed",
          ).length,
          failedSteps: execution.pipeline_steps.filter(
            (step) => step.status === "failed",
          ).length,
          totalSteps: execution.pipeline_steps.length,
        },
      });
    } catch (error) {
      // Announcing an outcome must never undo the outcome that was committed.
      console.error(
        `[GameGenerationService] failed to announce terminal state for ${execution.id}:`,
        error,
      );
    }
  }
}
