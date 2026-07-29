/**
 * @deprecated RUNTIME USAGE FORBIDDEN
 *
 * This module is preserved ONLY for:
 *   - PIPELINE_STAGES constant (consumed by assembly/generation modules)
 *   - Type reference in comments/documentation
 *
 * PlanExecutor (planning/execution/PlanExecutor.ts) is the ONLY canonical
 * runtime execution engine. Direct instantiation of AIPipelineIntegrator
 * will throw in production mode.
 */

import type {
  PipelineEvent,
  PipelineEventPublisher,
} from "../types/pipeline-events";
import type { GameBlueprint, GameDesignSeed } from "../types/blueprint";
import type { GameGenerationResult } from "../types/game-generation-result";
import { aggregateToGameGenerationResult } from "./gameGenerationResultAggregator";
import {
  EvaluationRegistry,
  getDefaultEvaluationRegistry,
} from "../evaluation/EvaluationRegistry";
import type { EvaluationResult } from "../evaluation/EvaluationResult";
import {
  MemoryRegistry,
  getDefaultMemoryRegistry,
} from "../memory/MemoryRegistry";
import { MemoryManager } from "../memory/MemoryManager";

/**
 * @deprecated RUNTIME DEPRECATION NOTICE
 *
 * AIPipelineIntegrator is NO LONGER the active runtime execution engine.
 * PlanExecutor (planning/execution/PlanExecutor.ts) is the ONLY canonical runtime.
 *
 * This module is preserved ONLY for:
 *   - PIPELINE_STAGES constant (used by legacy references)
 *   - Type exports
 *
 * DO NOT instantiate this class in production code.
 * Use PlanExecutor instead.
 */
import type { ProjectMemory } from "../memory/ProjectMemory";
import {
  PlanningRegistry,
  getDefaultPlanningRegistry,
} from "../planning/PlanningRegistry";
import type { ExecutionPlan, PlanStep } from "../planning/PlanningTypes";

type AgentExecutor = (
  agent: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

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
 * Plan-driven pipeline execution engine.
 * Replaces the former static stage loop with PlanningEngine.next() scheduling.
 *
 * Flow:
 *   PlanningEngine.buildPlan() → while (engine.next())
 *     → step.started → agentExecutor → evaluation → memory update → snapshot
 *     → engine.markCompleted/markFailed → planning.step.selected
 *     → (on failure) engine.replan() → planning.replanned
 *   → pipeline.completed / pipeline.failed
 */
export class AIPipelineIntegrator {
  /** Kept for backward compat — stages are now driven by PlanningRules. */
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
  private memoryRegistry: MemoryRegistry;
  private planningRegistry: PlanningRegistry;

  constructor(
    private readonly events: PipelineEventPublisher,
    evaluationRegistry?: EvaluationRegistry,
    memoryRegistry?: MemoryRegistry,
    planningRegistry?: PlanningRegistry,
  ) {
    // RUNTIME GUARD: Prevent instantiation in production
    if (
      process.env.NODE_ENV === "production" ||
      process.env.RUNTIME_MODE === "production"
    ) {
      throw new Error(
        "DEPRECATED: AIPipelineIntegrator must NOT be instantiated at runtime. " +
          "Use PlanExecutor as the only execution engine. " +
          "This module is preserved for PIPELINE_STAGES constant only.",
      );
    }

    this.evaluationRegistry =
      evaluationRegistry ?? getDefaultEvaluationRegistry();
    this.memoryRegistry = memoryRegistry ?? getDefaultMemoryRegistry();
    this.planningRegistry = planningRegistry ?? getDefaultPlanningRegistry();
  }

  async executePipeline(
    blueprint: GameBlueprint,
    agentExecutor: AgentExecutor,
    executionId: string,
    _mode: "sequential" | "parallel" | "hybrid" = "sequential",
  ): Promise<GameGenerationResult> {
    const pipelineId = executionId;
    const engine = this.planningRegistry.getEngine();

    // ── Create memory ──────────────────────────────────────────────────────
    const memory: ProjectMemory = this.memoryRegistry.create(
      executionId,
      blueprint.id,
      {
        name: blueprint.name,
        description: blueprint.description,
        gameType: blueprint.game_type,
        genre: blueprint.genre,
        targetAudience: blueprint.target_audience,
        difficulty: blueprint.difficulty,
        estimatedPlayers: blueprint.estimated_players,
      },
    );

    await this.emit({
      type: "memory.created",
      pipelineId,
      data: { executionId, blueprintId: blueprint.id },
      timestamp: new Date(),
    });

    // ── Create plan ────────────────────────────────────────────────────────
    let plan: ExecutionPlan = this.planningRegistry.createPlan(executionId);
    const issues = engine.validateDependencies(plan);
    if (issues.length > 0) {
      console.error("[PLANNING] Invalid dependency graph:", issues);
    }

    await this.emit({
      type: "planning.created",
      pipelineId,
      data: { planId: plan.planId, steps: plan.remainingSteps.length },
      timestamp: new Date(),
    });
    await this.emit({
      type: "pipeline.started",
      pipelineId,
      timestamp: new Date(),
    });

    let pipelineOutputs: Record<string, unknown> = {};
    const stepResults: StepResult[] = [];

    try {
      // ── Plan-driven execution loop ─────────────────────────────────────
      let nextStep: PlanStep | null = engine.next(plan);

      while (nextStep !== null) {
        const stage = nextStep;
        const stepStart = Date.now();

        await this.emit({
          type: "planning.step.selected",
          pipelineId,
          stepId: stage.id,
          data: {
            agent: stage.agent,
            priority: stage.priority,
            dependencies: stage.dependencies,
          },
          timestamp: new Date(),
        });

        engine.markRunning(plan, stage.id);
        await this.emit({
          type: "step.started",
          pipelineId,
          stepId: stage.id,
          data: { name: stage.agent },
          timestamp: new Date(),
        });

        // ── Build agent input ────────────────────────────────────────────
        const memoryManager = new MemoryManager(memory, stage.agent);
        const input: Record<string, unknown> = {
          blueprint,
          executionId,
          memory: memoryManager,
          projectContext: memory.readContext(),
          ...pipelineOutputs,
        };

        if (blueprint.generation_metadata?.gameDesignSeed) {
          input.gameDesignSeed = blueprint.generation_metadata
            .gameDesignSeed as GameDesignSeed;
        }

        // ── Execute agent ────────────────────────────────────────────────
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
        await this.emit({
          type: "evaluation.started",
          pipelineId,
          stepId: stage.id,
          data: { agentType: stage.id },
          timestamp: new Date(),
        });

        const evalResult = this.evaluationRegistry.evaluate(stage.id, output);

        await this.emit({
          type:
            evalResult.status === "failed"
              ? "evaluation.failed"
              : "evaluation.completed",
          pipelineId,
          stepId: stage.id,
          data: {
            agentType: stage.id,
            qualityScore: evalResult.qualityScore,
            status: evalResult.status,
            issueCount: evalResult.issues.length,
            durationMs: evalResult.durationMs,
          },
          timestamp: new Date(),
        });

        const agentFailed = output._failed === true;
        const evalFailed = evalResult.status === "failed";

        if (agentFailed || evalFailed) {
          const errorMsg = agentFailed
            ? typeof output._error === "string"
              ? output._error
              : "Agent execution failed"
            : `Evaluation failed for ${stage.agent}: score=${evalResult.qualityScore}`;

          engine.markFailed(plan, stage.id, errorMsg, agentDurationMs);
          memory.markStepFailed(stage.id);
          memory.appendWarning(errorMsg, stage.agent);
          memory.updateEvaluation(
            {
              lastScore: evalResult.qualityScore,
              lastStatus: evalResult.status,
              totalIssues: evalResult.issues.length,
            },
            stage.agent,
          );

          stepResults.push({
            stepId: stage.id,
            agent: stage.agent,
            status: "failed",
            output,
            durationMs: agentDurationMs,
            error: errorMsg,
            evaluation: evalResult,
          });

          await this.emit({
            type: "step.failed",
            pipelineId,
            stepId: stage.id,
            data: { error: errorMsg },
            timestamp: new Date(),
          });

          // ── Replanning ─────────────────────────────────────────────────
          const reason = agentFailed
            ? "evaluation_failed"
            : "evaluation_failed";
          const { plan: newPlan, event: replanEvt } = engine.replan(
            plan,
            stage.id,
            reason as "evaluation_failed",
          );
          this.planningRegistry.updatePlan(executionId, newPlan);
          plan = newPlan;

          await this.emit({
            type: "planning.replanned",
            pipelineId,
            stepId: stage.id,
            data: {
              reason: replanEvt.reason,
              preserved: replanEvt.preservedSteps.length,
              remaining: replanEvt.newPlan.length,
            },
            timestamp: new Date(),
          });

          // If replanning couldn't recover, abort
          if (plan.status === "failed") {
            pipelineOutputs = { ...pipelineOutputs, [stage.id]: output };
            throw new Error(
              `Stage "${stage.agent}" (${stage.id}) failed and is not recoverable: ${errorMsg}`,
            );
          }

          // Otherwise continue with next step from new plan
          nextStep = engine.next(plan);
          continue;
        }

        // ── Success ──────────────────────────────────────────────────────
        engine.markCompleted(
          plan,
          stage.id,
          agentDurationMs,
          evalResult.qualityScore,
        );

        pipelineOutputs = { ...pipelineOutputs, ...output, [stage.id]: output };
        this.updateMemoryFromOutput(memory, stage.id, stage.agent, output);

        memory.markStepCompleted(stage.id);
        memory.updateEvaluation(
          {
            lastScore: evalResult.qualityScore,
            lastStatus: evalResult.status,
            totalIssues: evalResult.issues.length,
            recommendations: evalResult.recommendations,
          },
          stage.agent,
        );
        for (const rec of evalResult.recommendations)
          memory.appendRecommendation(rec, stage.agent);

        memory.recordAgentExecution({
          agent: stage.agent,
          stepId: stage.id,
          startedAt: new Date(Date.now() - agentDurationMs),
          completedAt: new Date(),
          durationMs: agentDurationMs,
          qualityScore: evalResult.qualityScore,
          evaluationStatus: evalResult.status,
          warnings: evalResult.issues
            .filter((i) => i.severity === "warning")
            .map((i) => i.message),
          errors: evalResult.issues
            .filter((i) => i.severity === "error")
            .map((i) => i.message),
        });

        memory.takeSnapshot(stage.id);

        await this.emit({
          type: "memory.updated",
          pipelineId,
          stepId: stage.id,
          data: { agent: stage.agent, section: stage.id },
          timestamp: new Date(),
        });
        await this.emit({
          type: "memory.snapshot",
          pipelineId,
          stepId: stage.id,
          data: { snapshotNumber: memory.getSnapshots().length },
          timestamp: new Date(),
        });

        stepResults.push({
          stepId: stage.id,
          agent: stage.agent,
          status: "completed",
          output,
          durationMs: agentDurationMs,
          evaluation: evalResult,
        });

        await this.emit({
          type: "step.completed",
          pipelineId,
          stepId: stage.id,
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

        await this.emit({
          type: "planning.updated",
          pipelineId,
          data: {
            completed: plan.completedSteps,
            remaining: plan.remainingSteps,
          },
          timestamp: new Date(),
        });

        nextStep = engine.next(plan);
      }

      // ── Plan complete ────────────────────────────────────────────────────
      plan.status = "completed";
      plan.updatedAt = new Date();

      const metrics = engine.getMetrics(plan);
      await this.emit({
        type: "planning.completed",
        pipelineId,
        data: { planId: plan.planId, metrics },
        timestamp: new Date(),
      });
      await this.emit({
        type: "pipeline.completed",
        pipelineId,
        data: {
          outputs: pipelineOutputs,
          steps: stepResults,
          memorySummary: memory.getSummary(),
          planningMetrics: metrics,
        },
        timestamp: new Date(),
      });

      this.memoryRegistry.evict(executionId);
      this.planningRegistry.removePlan(executionId);

      return aggregateToGameGenerationResult(pipelineOutputs, {
        blueprint,
        executionId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pipeline failed";

      plan.status = "failed";
      plan.updatedAt = new Date();
      await this.emit({
        type: "planning.failed",
        pipelineId,
        data: { error: message, metrics: engine.getMetrics(plan) },
        timestamp: new Date(),
      });
      await this.emit({
        type: "pipeline.failed",
        pipelineId,
        data: { error: message, steps: stepResults },
        timestamp: new Date(),
      });

      this.memoryRegistry.evict(executionId);
      this.planningRegistry.removePlan(executionId);

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

  private updateMemoryFromOutput(
    memory: ProjectMemory,
    stepId: string,
    agentName: string,
    output: Record<string, unknown>,
  ): void {
    try {
      switch (stepId) {
        case "requirements":
          if (output.requirements)
            memory.writeContext(
              { requirements: output.requirements as any },
              agentName,
              "Requirements",
            );
          break;
        case "game_designer":
          if (output.gameplay) {
            const gp = output.gameplay as Record<string, unknown>;
            memory.writeContext(
              {
                gameplay: {
                  coreLoop: output.loop as string,
                  mechanics: gp.mechanics as any,
                  winCondition: output.winCondition as string,
                  loseCondition: output.loseCondition as string,
                  progressionModel: output.progressionModel as string,
                  interactionSystems: output.interactionSystems as string[],
                  economyOrScoring: output.economyOrScoring as string,
                  theme: (gp.balance as any)?.theme,
                },
              },
              agentName,
              "Gameplay",
            );
            if (typeof output.loop === "string")
              memory.appendDecision(
                agentName,
                "gameplay",
                `Core loop: ${(output.loop as string).slice(0, 60)}`,
                JSON.stringify({ loop: output.loop }),
                "Selected by GameDesigner from seed",
                "Drives all downstream design",
              );
          }
          break;
        case "roblox_architect":
          if (output.architecture || output.roblox_architect) {
            const arch = (output.architecture ??
              output.roblox_architect) as Record<string, unknown>;
            const ra = output.roblox_architect as
              Record<string, unknown> | undefined;
            memory.writeContext(
              {
                architecture: {
                  folderStructure: (arch as any).folderStructure,
                  dataModels: (arch as any).dataModels,
                  services: (arch as any).services,
                  apiContracts: (arch as any).apiContracts,
                  clientArchitecture: (ra as any)?.client_architecture,
                  serverArchitecture: (ra as any)?.server_architecture,
                  networking: (ra as any)?.networking,
                },
              },
              agentName,
              "Architecture",
            );
            memory.appendDecision(
              agentName,
              "architecture",
              "Client/server architecture defined",
              JSON.stringify({ services: (arch as any).services }),
              "Derived from gameplay systems",
              "Determines folder structure and networking",
            );
          }
          break;
        case "lua_generator":
          if (output.lua_generator) {
            const lua = output.lua_generator as Record<string, unknown>;
            memory.writeContext(
              {
                scripts: {
                  server: lua.server as any,
                  client: lua.client as any,
                  shared: lua.shared as any,
                  patterns: lua.patterns as any,
                },
              },
              agentName,
              "Scripts",
            );
          }
          break;
        case "ui_generator":
          if (output.uiDesign) {
            const ui = output.uiDesign as Record<string, unknown>;
            memory.writeContext(
              {
                ui: {
                  screens: ui.screens as any,
                  components: ui.components as any,
                },
              },
              agentName,
              "UI",
            );
          }
          break;
        case "asset_planner":
          if (output.assetPlan) {
            const ap = output.assetPlan as Record<string, unknown>;
            memory.writeContext(
              {
                assets: {
                  models: ap.models as any,
                  textures: ap.textures as any,
                  sounds: ap.sounds as any,
                  animations: ap.animations as any,
                },
              },
              agentName,
              "Assets",
            );
          }
          break;
        case "final":
          if (output.world) {
            const w = output.world as Record<string, unknown>;
            memory.writeContext(
              {
                world: {
                  name: w.name as any,
                  description: w.description as any,
                  places: w.places as any,
                  models: w.models as any,
                  systemsHooks: w.systemsHooks as any,
                },
              },
              agentName,
              "World",
            );
            memory.appendDecision(
              agentName,
              "world",
              `World synthesised: ${String(w.name ?? "Game")}`,
              JSON.stringify({ systems: output.systems }),
              "Orchestrator final aggregation",
              "Canonical game artifact",
            );
          }
          break;
      }
    } catch {
      /* Memory errors must never abort pipeline */
    }
  }

  async emit(event: PipelineEvent): Promise<void> {
    await this.events.emit(event);
  }
}
