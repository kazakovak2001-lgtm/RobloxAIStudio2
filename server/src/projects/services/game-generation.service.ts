import { randomUUID } from "crypto";

import type {
  GameBlueprint,
  BlueprintChangeProposal,
  BlueprintVersion,
  CreateBlueprintInput,
  RequirementSpec,
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
import type { DurableMutation } from "../../platform/storage/StorageProvider";
import { evaluateRequirementCoverage } from "../../validation/requirementTraceability";
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

/** Refusal from the blueprint proposal review path. */
export class BlueprintProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueprintProposalError";
  }
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
   * CHAT-BLUEPRINT-DISCONNECT-001. Record a proposed design change.
   *
   * A proposal changes nothing. The Define conversation could previously state
   * that it had altered the design while the next generation still consumed the
   * old blueprint, because nothing connected the two. Writing the claim down as
   * a pending, field-level proposal makes it reviewable and, until accepted,
   * inert.
   */
  async proposeBlueprintChange(
    blueprintId: string,
    proposedBy: string,
    changes: Partial<GameBlueprint>,
    rationale?: string,
  ): Promise<BlueprintChangeProposal> {
    const blueprint = await this.repository.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }
    const editable = this.editableChanges(changes);
    if (Object.keys(editable).length === 0) {
      throw new BlueprintProposalError(
        "A proposal must change at least one design field",
      );
    }

    const proposal: BlueprintChangeProposal = {
      id: `blueprint-proposal-${randomUUID()}`,
      project_id: blueprint.project_id,
      blueprint_id: blueprint.id,
      proposed_by: proposedBy,
      created_at: new Date(),
      changes: editable,
      ...(rationale ? { rationale } : {}),
      status: "pending",
    };
    return this.repository.saveProposal(proposal);
  }

  async listBlueprintProposals(
    projectId: string,
    status?: BlueprintChangeProposal["status"],
  ): Promise<BlueprintChangeProposal[]> {
    return this.repository.listProposals(projectId, status);
  }

  /**
   * Apply a proposal and version the result, in one transaction.
   *
   * The updated blueprint, the version recording it and the proposal's decision
   * commit together. Applying the change without recording the version would
   * leave a design nothing could trace; recording a version for a change that
   * did not commit would claim a design that never existed.
   */
  async acceptBlueprintProposal(
    proposalId: string,
    decidedBy: string,
  ): Promise<{ blueprint: GameBlueprint; version: BlueprintVersion }> {
    const proposal = this.repository.getProposal(proposalId);
    if (!proposal) throw new BlueprintProposalError("Proposal not found");
    if (proposal.status !== "pending") {
      throw new BlueprintProposalError(
        `Proposal ${proposalId} is already ${proposal.status}`,
      );
    }

    const blueprint = await this.repository.getBlueprint(proposal.blueprint_id);
    if (!blueprint) throw new BlueprintProposalError("Blueprint not found");

    const updated: GameBlueprint = {
      ...blueprint,
      ...this.editableChanges(proposal.changes),
      id: blueprint.id,
      project_id: blueprint.project_id,
      user_id: blueprint.user_id,
      created_at: blueprint.created_at,
      updated_at: new Date(),
      version: blueprint.version + 1,
    };

    const { version, mutations } = await this.repository.prepareVersion(
      blueprint.id,
      decidedBy,
      `Accepted proposal ${proposal.id}`,
      updated,
    );

    await this.repository.commitProposalAcceptance(updated, mutations, {
      ...proposal,
      status: "accepted",
      decided_at: new Date(),
      decided_by: decidedBy,
      applied_version_id: version.id,
    });

    this.cache.set(updated.project_id, updated);
    return { blueprint: updated, version };
  }

  async rejectBlueprintProposal(
    proposalId: string,
    decidedBy: string,
  ): Promise<BlueprintChangeProposal> {
    const proposal = this.repository.getProposal(proposalId);
    if (!proposal) throw new BlueprintProposalError("Proposal not found");
    if (proposal.status !== "pending") {
      throw new BlueprintProposalError(
        `Proposal ${proposalId} is already ${proposal.status}`,
      );
    }

    const rejected: BlueprintChangeProposal = {
      ...proposal,
      status: "rejected",
      decided_at: new Date(),
      decided_by: decidedBy,
    };
    return this.repository.saveProposal(rejected);
  }

  /**
   * Keep a proposal to design fields.
   *
   * Identity, ownership and lifecycle bookkeeping are not design, and a
   * proposal that could rewrite them would be a way to move a blueprint between
   * projects through the review path.
   */
  private editableChanges(
    changes: Partial<GameBlueprint>,
  ): Partial<GameBlueprint> {
    const forbidden = new Set([
      "id",
      "project_id",
      "user_id",
      "created_at",
      "updated_at",
      "version",
      "status",
    ]);
    return Object.fromEntries(
      Object.entries(changes).filter(([field]) => !forbidden.has(field)),
    ) as Partial<GameBlueprint>;
  }

  /**
   * AUDIT-START-ATOMICITY-001 and SEC-GENERATION-BLUEPRINT-001.
   *
   * Resolve the blueprint and build the execution record **without**
   * persisting it and without starting any process-local work. Split out of
   * `startGeneration` so a caller that must commit the execution together with
   * other durable evidence — project state, start history and the active-run
   * claim — can put them all in one `applyDurableBatch`.
   *
   * `blueprintIdOrProjectId` is caller-supplied and resolves against both
   * blueprint ids and project ids, so on its own it decides which project the
   * execution belongs to. A caller authorized for one project could otherwise
   * pass a blueprint id belonging to another. `expectedProjectId` closes that:
   * the resolved blueprint must belong to it.
   *
   * The check moved here with the split, and is stricter for it. It used to
   * sit before `recordExecution`; it now runs before anything durable exists
   * at all, so a refused request leaves no state to reconcile. It stays
   * optional so existing internal callers keep working, but every
   * request-driven caller is expected to pass it.
   */
  async prepareGeneration(
    blueprintIdOrProjectId: string,
    userId: string,
    expectedProjectId?: string,
  ): Promise<{
    execution: GenerationExecution;
    blueprint: GameBlueprint;
    /**
     * BLUEPRINT-STALE-001. Durable mutations recording the immutable snapshot
     * this run is bound to. The caller commits them in the same transaction as
     * the execution: a snapshot without its execution, or an execution naming a
     * snapshot that never committed, are both unrepairable states.
     */
    versionMutations: DurableMutation[];
  }> {
    const blueprint =
      (await this.repository.getBlueprint(blueprintIdOrProjectId)) ??
      (await this.repository.getBlueprintByProjectId(blueprintIdOrProjectId));

    if (!blueprint) {
      throw new Error(
        `Blueprint not found for id/project ${blueprintIdOrProjectId}`,
      );
    }

    // Fail closed before recordExecution: nothing about project
    // `expectedProjectId` or the blueprint's own project may be mutated.
    if (expectedProjectId && blueprint.project_id !== expectedProjectId) {
      throw new Error(
        `Blueprint ${blueprint.id} does not belong to project ${expectedProjectId}`,
      );
    }

    // BLUEPRINT-STALE-001. Freeze the design this run will consume. Generation
    // used to reference the mutable blueprint, so editing the brief after a run
    // silently changed what that run appeared to have been generated from, and
    // two runs of "the same" blueprint could be two different designs.
    const { version, mutations: versionMutations } =
      await this.repository.prepareVersion(
        blueprint.id,
        userId,
        `Snapshot taken for generation of project ${blueprint.project_id}`,
      );

    const now = new Date();
    const execution: GenerationExecution = {
      // AUDIT-ID-EXEC-001. `exec-${Date.now()}` collided whenever two starts
      // landed in the same millisecond, and `generation_executions` is keyed by
      // this id alone, across every project — so the second write silently
      // overwrote the first execution's ownership and state. Identity must not
      // depend on wall-clock resolution. The `exec-` prefix is kept because
      // existing evidence and logs are read by it; only the suffix changes.
      id: `exec-${randomUUID()}`,
      blueprint_id: blueprint.id,
      project_id: blueprint.project_id,
      user_id: userId,
      started_at: now,
      status: "running",
      blueprint_version_id: version.id,
      blueprint_snapshot_hash: version.snapshot_hash,
      retry_count: 0,
      pipeline_steps: [],
    };

    return { execution, blueprint, versionMutations };
  }

  /**
   * Persist the execution on its own and start it. Unchanged contract for
   * callers that do not need the execution to share a transaction with other
   * durable evidence.
   *
   * `expectedProjectId` is forwarded rather than re-checked: the ownership
   * assertion belongs where the blueprint is resolved, and duplicating it here
   * would give two places to keep in step.
   */
  async startGeneration(
    blueprintIdOrProjectId: string,
    userId: string,
    expectedProjectId?: string,
  ): Promise<GenerationExecution> {
    const { execution, blueprint } = await this.prepareGeneration(
      blueprintIdOrProjectId,
      userId,
      expectedProjectId,
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
              ...this.resolveRequirementCoverage(result.graph.getAllNodes()),
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
  /**
   * INTENT-FIDELITY-001. Record what this run could show about its requirements.
   *
   * The requirements agent gives each requirement an identifier; coverage asks
   * which of those identifiers appear anywhere in what the run produced. Today
   * the answer is mostly none, because the chain does not carry them yet, and
   * that is exactly why it is recorded: the gap becomes a number on the run
   * instead of an assumption about it.
   *
   * Never throws. A run that produced a package must not be failed because a
   * measurement about it could not be taken.
   */
  private resolveRequirementCoverage(
    nodes: ReadonlyArray<{ output?: unknown }>,
  ): Pick<GenerationExecution, "requirement_coverage"> {
    try {
      const outputs = nodes
        .map((node) => node.output)
        .filter((output): output is Record<string, unknown> =>
          Boolean(output && typeof output === "object"),
        );
      const specs = outputs.flatMap((output) =>
        Array.isArray(output.requirement_specs)
          ? (output.requirement_specs as RequirementSpec[])
          : [],
      );
      if (specs.length === 0) return {};

      // The requirements output itself is excluded: a requirement appearing in
      // its own definition is not evidence that anything downstream honoured it.
      const downstream = outputs.filter(
        (output) => !Array.isArray(output.requirement_specs),
      );
      return {
        requirement_coverage: evaluateRequirementCoverage(specs, downstream),
      };
    } catch {
      return {};
    }
  }
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
