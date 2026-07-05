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
import {
  MemoryRegistry,
  getDefaultMemoryRegistry,
} from "../memory/MemoryRegistry";
import { MemoryManager } from "../memory/MemoryManager";
import type { ProjectMemory } from "../memory/ProjectMemory";

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
 * Drives the sequential agent pipeline.
 * Per-stage flow:
 *   1. Emit step.started
 *   2. Build input (blueprint + seed + flat accumulated outputs + memory context)
 *   3. Run agentExecutor
 *   4. Emit evaluation.started → run Evaluator → emit evaluation.completed/failed
 *   5. Update ProjectMemory context from agent output
 *   6. Take memory snapshot
 *   7. Emit memory.updated / memory.snapshot
 *   8. On failure → step.failed + abort; on success → step.completed
 */
export class AIPipelineIntegrator {
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

  constructor(
    private readonly events: PipelineEventEmitter,
    evaluationRegistry?: EvaluationRegistry,
    memoryRegistry?: MemoryRegistry,
  ) {
    this.evaluationRegistry =
      evaluationRegistry ?? getDefaultEvaluationRegistry();
    this.memoryRegistry = memoryRegistry ?? getDefaultMemoryRegistry();
  }

  async executePipeline(
    blueprint: GameBlueprint,
    agentExecutor: AgentExecutor,
    executionId: string,
    _mode: "sequential" | "parallel" | "hybrid" = "sequential",
  ): Promise<GameGenerationResult> {
    const pipelineId = executionId;

    // ── Create project memory for this execution ────────────────────────────
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

    await this.events.emit({
      type: "memory.created",
      pipelineId,
      data: { executionId, blueprintId: blueprint.id },
      timestamp: new Date(),
    });

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

        // ── Agent input: blueprint + seed + flat outputs + memory context ──
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

        // ── Agent execution ────────────────────────────────────────────────
        let output: Record<string, unknown>;
        try {
          output = await agentExecutor(stage.agent, input);
        } catch (agentErr) {
          const errMsg =
            agentErr instanceof Error ? agentErr.message : "Agent threw";
          output = { _failed: true, _error: errMsg, _agent: stage.agent };
        }

        const agentDurationMs = Date.now() - stepStart;

        // ── Evaluation ─────────────────────────────────────────────────────
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

        await this.events.emit({
          type:
            evalResult.status === "failed"
              ? "evaluation.failed"
              : "evaluation.completed",
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

        const agentFailed = output._failed === true;
        const evalFailed = evalResult.status === "failed";

        if (agentFailed || evalFailed) {
          const errorMsg = agentFailed
            ? typeof output._error === "string"
              ? output._error
              : "Agent execution failed"
            : `Evaluation failed for ${stage.agent}: score=${evalResult.qualityScore}`;

          memory.markStepFailed(stage.stepId);
          memory.appendWarning(errorMsg, stage.agent);
          memory.updateEvaluation(
            {
              lastScore: evalResult.qualityScore,
              lastStatus: evalResult.status,
              totalIssues: evalResult.issues.length,
            },
            stage.agent,
          );
          memory.takeSnapshot(stage.stepId);

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
          this.memoryRegistry.evict(executionId);

          throw new Error(
            `Stage "${stage.agent}" (${stage.stepId}) failed: ${errorMsg}`,
          );
        }

        // ── Success: update memory context from output ─────────────────────
        this.updateMemoryFromOutput(memory, stage.stepId, stage.agent, output);

        memory.markStepCompleted(stage.stepId);
        memory.updateEvaluation(
          {
            lastScore: evalResult.qualityScore,
            lastStatus: evalResult.status,
            totalIssues: evalResult.issues.length,
            recommendations: evalResult.recommendations,
          },
          stage.agent,
        );

        // Propagate evaluation recommendations to memory
        for (const rec of evalResult.recommendations) {
          memory.appendRecommendation(rec, stage.agent);
        }

        // Record execution history
        memory.recordAgentExecution({
          agent: stage.agent,
          stepId: stage.stepId,
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

        // Take snapshot after successful step
        const snapshot = memory.takeSnapshot(stage.stepId);

        await this.events.emit({
          type: "memory.updated",
          pipelineId,
          stepId: stage.stepId,
          data: {
            agent: stage.agent,
            section: stage.stepId,
            completedSteps: memory.readContext().pipeline.completedSteps,
          },
          timestamp: new Date(),
        });

        await this.events.emit({
          type: "memory.snapshot",
          pipelineId,
          stepId: stage.stepId,
          data: {
            snapshotId: snapshot.id,
            snapshotNumber: snapshot.snapshotNumber,
            pipelineStep: stage.stepId,
          },
          timestamp: new Date(),
        });

        // Accumulate outputs
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
            memorySummary: memory.getSummary(),
          },
          timestamp: new Date(),
        });
      }

      await this.events.emit({
        type: "pipeline.completed",
        pipelineId,
        data: {
          outputs: pipelineOutputs,
          steps: stepResults,
          memorySummary: memory.getSummary(),
        },
        timestamp: new Date(),
      });

      this.memoryRegistry.evict(executionId);

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
   * Map agent output keys to ProjectContext sections.
   * Called after each successful step to keep memory current.
   */
  private updateMemoryFromOutput(
    memory: ProjectMemory,
    stepId: string,
    agentName: string,
    output: Record<string, unknown>,
  ): void {
    try {
      switch (stepId) {
        case "requirements":
          if (output.requirements) {
            memory.writeContext(
              {
                requirements: output.requirements as Parameters<
                  ProjectMemory["writeContext"]
                >[0]["requirements"],
              },
              agentName,
              "Requirements",
            );
          }
          break;

        case "game_designer":
          if (output.gameplay) {
            const gp = output.gameplay as Record<string, unknown>;
            memory.writeContext(
              {
                gameplay: {
                  coreLoop: output.loop as string | undefined,
                  mechanics: gp.mechanics as
                    | Array<{ name: string; description: string }>
                    | undefined,
                  winCondition: output.winCondition as string | undefined,
                  loseCondition: output.loseCondition as string | undefined,
                  progressionModel: output.progressionModel as
                    | string
                    | undefined,
                  interactionSystems: output.interactionSystems as
                    | string[]
                    | undefined,
                  economyOrScoring: output.economyOrScoring as
                    | string
                    | undefined,
                  theme: (gp.balance as Record<string, unknown> | undefined)
                    ?.theme as string | undefined,
                },
              },
              agentName,
              "Gameplay",
            );
            // Record the core design decision
            if (typeof output.loop === "string") {
              memory.appendDecision({
                category: "gameplay",
                summary: `Core gameplay loop defined: ${(output.loop as string).slice(0, 80)}`,
                details: JSON.stringify({
                  loop: output.loop,
                  winCondition: output.winCondition,
                }),
                reason:
                  "Game designer agent selected loop based on genre and seed",
                impact:
                  "Drives all subsequent mechanics and progression design",
              });
            }
          }
          break;

        case "roblox_architect":
          if (output.architecture || output.roblox_architect) {
            const arch = (output.architecture ??
              output.roblox_architect) as Record<string, unknown>;
            const ra = output.roblox_architect as
              | Record<string, unknown>
              | undefined;
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
            memory.appendDecision({
              category: "architecture",
              summary: "Roblox client/server architecture defined",
              details: JSON.stringify({ services: (arch as any).services }),
              reason: "RobloxArchitect agent derived from gameplay systems",
              impact:
                "Determines folder structure, services, and networking contracts",
            });
          }
          break;

        case "lua_generator":
          if (output.lua_generator) {
            const lua = output.lua_generator as Record<string, unknown>;
            memory.writeContext(
              {
                scripts: {
                  server: lua.server as
                    | Array<{ name: string; code: string }>
                    | undefined,
                  client: lua.client as
                    | Array<{ name: string; code: string }>
                    | undefined,
                  shared: lua.shared as
                    | Array<{ name: string; code: string }>
                    | undefined,
                  patterns: lua.patterns as string[] | undefined,
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
                  screens: ui.screens as
                    | Array<{ name: string; type: string; elements: unknown[] }>
                    | undefined,
                  components: ui.components as
                    | Record<string, unknown>
                    | undefined,
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
                  models: ap.models as unknown[] | undefined,
                  textures: ap.textures as unknown[] | undefined,
                  sounds: ap.sounds as unknown[] | undefined,
                  animations: ap.animations as unknown[] | undefined,
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
                  name: w.name as string | undefined,
                  description: w.description as string | undefined,
                  places: w.places as unknown[] | undefined,
                  models: w.models as unknown[] | undefined,
                  systemsHooks: w.systemsHooks as
                    | Record<string, unknown>
                    | undefined,
                },
              },
              agentName,
              "World",
            );
            memory.appendDecision({
              category: "world",
              summary: `Final world definition synthesised: ${String(w.name ?? "Generated Game")}`,
              details: JSON.stringify({ systems: output.systems }),
              reason: "Orchestrator final aggregation stage",
              impact: "Canonical game artifact definition for export",
            });
          }
          break;
      }
    } catch {
      // Memory write errors must never abort the pipeline
    }
  }

  async emit(event: PipelineEvent): Promise<void> {
    await this.events.emit(event);
  }
}
