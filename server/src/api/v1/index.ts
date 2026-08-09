/**
 * API v1 — Stable Production Contract
 *
 * All endpoints under /api/v1/* are considered stable and contract-locked.
 * Breaking changes require a new version (v2).
 *
 * Routing:
 *   /api/v1/compile      → PlanExecutor-driven compile
 *   /api/v1/plan/*       → Planning engine
 *   /api/v1/generate     → Game generation
 *   /api/v1/memory/*     → Memory engine
 *   /api/v1/evaluate     → Evaluation engine
 *   /api/v1/simulate     → Simulation engine
 *   /api/v1/economy      → Economy engine
 *   /api/v1/world        → World engine
 *   /api/v1/lifecycle    → Lifecycle engine
 */

import { Router } from "express";
import { ApiGateway, type RequestWithTrace } from "../gateway/ApiGateway";
import { ResponseFormatter } from "../gateway/ResponseFormatter";
import {
  PlannerEngine,
  PlanValidationError,
} from "../../planning/core/PlannerEngine";
import { PlanExecutor } from "../../planning/execution/PlanExecutor";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { GameBlueprintEngine } from "../../generation/blueprint/GameBlueprintEngine";
import { LuaGenerator } from "../../generation/lua/LuaGenerator";
import { AssetGenerator } from "../../generation/assets/AssetGenerator";
import { GameValidationEngine } from "../../generation/validation/GameValidationEngine";
import { GameSimulationEngine } from "../../simulation/core/GameSimulationEngine";
import { PlaytestAgent } from "../../simulation/agents/PlaytestAgent";
import { EconomyModelEngine } from "../../economy/core/EconomyModelEngine";
import { ImbalanceDetector } from "../../economy/detection/ImbalanceDetector";
import { EconomySimulationEngine } from "../../economy/simulation/EconomySimulationEngine";
import { GameArtifactBuilder } from "../../artifacts/GameArtifactBuilder";
import { RobloxProjectCompiler } from "../../export/RobloxProjectCompiler";
import type { ProjectAccessControl } from "../../routes/projects";

export function createV1Router(
  agentRegistry: AgentRegistry,
  gateway: ApiGateway,
  access: ProjectAccessControl,
): Router {
  const router = gateway.createVersionedRouter("v1");
  const formatter = new ResponseFormatter("1.0.0");

  const requirePlanProjectAccess = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    res: Parameters<ProjectAccessControl["requireProjectAccess"]>[1],
    planId: string,
  ) => {
    const plan = plans.get(planId);
    const projectId = plan?.goal.projectId;
    if (!plan || !projectId) {
      res.status(404).json(formatter.notFound("Plan", planId));
      return undefined;
    }
    if (!(await access.requireProjectAccess(req, res, projectId)))
      return undefined;
    return plan;
  };

  const plans = new Map<string, ReturnType<PlannerEngine["createPlan"]>>();

  // ─── POST /compile — full deterministic compile ─────────────────────────
  router.post("/compile", async (req, res) => {
    const traceId = (req as RequestWithTrace).traceId;
    const startTime = (req as RequestWithTrace).startTime;

    try {
      const { intent, constraints, projectId } = req.body;
      if (!projectId || typeof projectId !== "string") {
        res
          .status(400)
          .json(
            formatter.error(
              "PROJECT_ID_REQUIRED",
              "projectId is required",
              undefined,
              { traceId, startTime },
            ),
          );
        return;
      }
      if (!(await access.requireProjectAccess(req, res, projectId))) return;

      const planner = new PlannerEngine();
      const executor = new PlanExecutor();
      const plan = planner.createPlan({
        intent: intent ?? "Generate a Roblox game",
        constraints: constraints ?? [],
        projectId,
      });

      const planResult = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agent, input) => agentRegistry.executeAgent(agent, input),
        { projectId, stopOnFailure: false },
      );

      const blueprintEngine = new GameBlueprintEngine();
      const blueprint = blueprintEngine.generate(planResult.outputs);

      const luaGen = new LuaGenerator();
      const scripts = luaGen.generate(blueprint);

      const assetGen = new AssetGenerator();
      const assets = assetGen.generate(blueprint);

      const validator = new GameValidationEngine();
      const validation = validator.validate(blueprint, scripts, assets);

      if (!validation.passed || validation.score < 70) {
        res.json(
          formatter.error(
            "VALIDATION_GATE_FAILED",
            "Compilation blocked by validation gate",
            {
              score: validation.score,
              passed: validation.passed,
              errors: validation.errors,
              warnings: validation.warnings,
              stoppedAt: "validation",
            },
            { traceId, startTime },
          ),
        );
        return;
      }

      const simEngine = new GameSimulationEngine();
      const simulation = simEngine.simulateGame(blueprint, 50);
      const playtester = new PlaytestAgent();
      const playtest = playtester.analyze(blueprint, simulation);

      const econEngine = new EconomyModelEngine();
      const economyModel = econEngine.parse(blueprint);
      const econSim = new EconomySimulationEngine();
      const econResult = econSim.simulate(economyModel, 100);
      const detector = new ImbalanceDetector();
      const imbalanceReport = detector.detect(economyModel, econResult);

      const artifactBuilder = new GameArtifactBuilder();
      const artifact = artifactBuilder.build({
        blueprint,
        scripts,
        assets,
        validation,
        economyModel,
        imbalanceReport,
        simulation,
        playtest,
        worldStability: 80,
        startTime,
      });

      const compiler = new RobloxProjectCompiler();
      const project = compiler.compile(artifact);

      res.json(
        formatter.success(
          {
            artifact: {
              id: artifact.id,
              blueprint: {
                title: artifact.blueprint.title,
                genre: artifact.blueprint.genre,
                mechanics: artifact.blueprint.mechanics,
              },
              scripts: {
                total: artifact.scripts.totalScripts,
                lines: artifact.scripts.totalLines,
              },
              assets: { objects: artifact.assets.totalObjects },
              validation: {
                score: artifact.validationReport.score,
                passed: artifact.validationReport.passed,
              },
              simulation: {
                engagement: artifact.simulationReport.playtest.engagementScore,
              },
              economy: {
                stability: artifact.economy.model.stabilityIndex,
                health: artifact.economy.imbalanceReport?.healthScore,
              },
            },
            project: {
              name: project.projectName,
              files: project.totalFiles,
              valid: project.valid,
              structure: project.structure,
            },
            pipeline: artifact.pipeline,
          },
          { traceId, startTime },
        ),
      );
    } catch (err) {
      res
        .status(500)
        .json(
          formatter.error(
            "COMPILE_FAILED",
            "Compilation failed",
            err instanceof Error ? err.message : undefined,
            { traceId, startTime },
          ),
        );
    }
  });

  // ─── POST /plan/create ─────────────────────────────────────────────────
  router.post("/plan/create", async (req, res) => {
    const traceId = (req as RequestWithTrace).traceId;
    const startTime = (req as RequestWithTrace).startTime;

    try {
      const projectId = req.body.projectId;
      if (!projectId || typeof projectId !== "string") {
        res
          .status(400)
          .json(
            formatter.error(
              "PROJECT_ID_REQUIRED",
              "projectId is required",
              undefined,
              { traceId, startTime },
            ),
          );
        return;
      }
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      const planner = new PlannerEngine();
      const plan = planner.createPlan({
        intent: req.body.intent ?? req.body.goal ?? "Generate a Roblox game",
        constraints: req.body.constraints ?? [],
        requiredAgents: req.body.requiredAgents,
        projectId,
        context: req.body.context,
      });
      plans.set(plan.planId, plan);

      res.json(
        formatter.success(
          {
            planId: plan.planId,
            goal: plan.goal.intent,
            estimatedSteps: plan.estimatedSteps,
            tasks: plan.graph.getAllNodes().map((n) => ({
              id: n.id,
              agent: n.agent,
              type: n.type,
              dependencies: n.dependencies,
              status: n.status,
            })),
          },
          { traceId, startTime },
        ),
      );
    } catch (err) {
      // An unbuildable agent selection is a bad request, not a server fault.
      if (err instanceof PlanValidationError) {
        res
          .status(400)
          .json(
            formatter.error(
              "PLAN_NOT_EXECUTABLE",
              "Requested plan is not executable",
              { issues: err.issues },
              { traceId, startTime },
            ),
          );
        return;
      }
      res
        .status(500)
        .json(
          formatter.error(
            "PLAN_CREATE_FAILED",
            "Plan creation failed",
            err instanceof Error ? err.message : undefined,
            { traceId, startTime },
          ),
        );
    }
  });

  // ─── POST /plan/execute ────────────────────────────────────────────────
  router.post("/plan/execute", async (req, res) => {
    const traceId = (req as RequestWithTrace).traceId;
    const startTime = (req as RequestWithTrace).startTime;

    try {
      const { planId, options } = req.body;
      const plan = await requirePlanProjectAccess(req, res, planId);
      if (!plan) {
        res.status(404).json(formatter.notFound("Plan", planId, { traceId }));
        return;
      }

      const executor = new PlanExecutor();
      const result = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agentType, input) => agentRegistry.executeAgent(agentType, input),
        {
          projectId: plan.goal.projectId,
          stopOnFailure: options?.stopOnFailure ?? true,
          maxRetries: options?.maxRetries ?? 1,
        },
      );

      res.json(
        formatter.success(
          {
            planId: result.planId,
            success: result.success,
            completedNodes: result.completedNodes,
            failedNodes: result.failedNodes,
            totalDurationMs: result.totalDurationMs,
            taskStats: result.graph.getStats(),
          },
          { traceId, startTime },
        ),
      );
    } catch (err) {
      res
        .status(500)
        .json(
          formatter.error(
            "PLAN_EXECUTE_FAILED",
            "Plan execution failed",
            err instanceof Error ? err.message : undefined,
            { traceId, startTime },
          ),
        );
    }
  });

  // ─── GET /plan/:id ─────────────────────────────────────────────────────
  router.get("/plan/:id", async (req, res) => {
    const traceId = (req as unknown as RequestWithTrace).traceId;
    const plan = await requirePlanProjectAccess(req, res, req.params.id);
    if (!plan) {
      res
        .status(404)
        .json(formatter.notFound("Plan", req.params.id, { traceId }));
      return;
    }

    res.json(
      formatter.success(
        {
          planId: plan.planId,
          goal: plan.goal,
          createdAt: plan.createdAt,
          tasks: plan.graph.getAllNodes().map((n) => ({
            id: n.id,
            agent: n.agent,
            type: n.type,
            status: n.status,
            durationMs: n.durationMs,
            evaluation: n.evaluation,
            error: n.error,
          })),
          stats: plan.graph.getStats(),
        },
        { traceId },
      ),
    );
  });

  // ─── GET /status — gateway status ─────────────────────────────────────
  router.get("/status", (req, res) => {
    const traceId = (req as RequestWithTrace).traceId;
    res.json(
      formatter.success(
        {
          gateway: gateway.getStatus(),
          runtime: "PlanExecutor",
          executionPath:
            "ApiGateway → Validation → PlannerEngine → PlanExecutor → ResponseFormatter",
        },
        { traceId },
      ),
    );
  });

  // ─── GET /contracts — list all registered contracts ────────────────────
  router.get("/contracts", (req, res) => {
    const traceId = (req as RequestWithTrace).traceId;
    const schemas = gateway.getValidator().listSchemas();
    res.json(
      formatter.success(
        {
          count: schemas.length,
          contracts: schemas.map((s) => ({
            endpoint: s.endpoint,
            method: s.method,
            version: s.version,
            fields: s.request.map((r) => ({
              field: r.field,
              required: r.required ?? false,
              type: r.type,
            })),
          })),
        },
        { traceId },
      ),
    );
  });

  return router;
}
