/**
 * planning.routes.ts
 *
 * API layer for the Autonomous Planning system.
 */

import { Router } from "express";
import { PlannerEngine, type PlanGoal } from "../planning/core/PlannerEngine";
import {
  PlanExecutor,
  type ExecutionOptions,
} from "../planning/execution/PlanExecutor";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import type { ProjectAccessControl } from "./projects";

export function createPlanningRouter(
  agentRegistry: AgentRegistry,
  access: ProjectAccessControl,
): Router {
  const router = Router();
  const planner = new PlannerEngine();
  const executor = new PlanExecutor();

  // Store plans in memory for retrieval
  const plans = new Map<string, ReturnType<PlannerEngine["createPlan"]>>();

  const requirePlanProjectAccess = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    res: Parameters<ProjectAccessControl["requireProjectAccess"]>[1],
    plan: ReturnType<PlannerEngine["createPlan"]>,
  ): Promise<boolean> => {
    const projectId = plan.goal.projectId;
    if (!projectId) {
      res.status(404).json({ success: false, error: "Plan not found" });
      return false;
    }
    if (access.hasProjectAccess) {
      if (await access.hasProjectAccess(req, projectId)) return true;
      res.status(404).json({ success: false, error: "Plan not found" });
      return false;
    }
    return access.requireProjectAccess(req, res, projectId);
  };

  // POST /plan/create — create a new execution plan from a goal
  router.post("/create", async (req, res) => {
    try {
      const projectId = req.body.projectId;
      if (typeof projectId !== "string" || projectId.trim().length === 0) {
        res
          .status(400)
          .json({ success: false, error: "projectId is required" });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, projectId))) return;

      const goal: PlanGoal = {
        intent: req.body.intent ?? req.body.goal ?? "Generate a Roblox game",
        constraints: req.body.constraints ?? [],
        requiredAgents: req.body.requiredAgents,
        projectId,
        context: req.body.context,
      };

      const plan = planner.createPlan(goal);
      plans.set(plan.planId, plan);

      res.json({
        success: true,
        data: {
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
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Plan creation failed" });
    }
  });

  // POST /plan/execute — execute an existing plan
  router.post("/execute", async (req, res) => {
    try {
      const { planId, options } = req.body;
      const plan = plans.get(planId);

      if (!plan) {
        res.status(404).json({ success: false, error: "Plan not found" });
        return;
      }

      if (!(await requirePlanProjectAccess(req, res, plan))) return;

      const execOptions: ExecutionOptions = {
        projectId: plan.goal.projectId,
        stopOnFailure: options?.stopOnFailure ?? true,
        maxRetries: options?.maxRetries ?? 1,
      };

      const result = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agentType, input) => agentRegistry.executeAgent(agentType, input),
        execOptions,
      );

      res.json({
        success: true,
        data: {
          planId: result.planId,
          success: result.success,
          completedNodes: result.completedNodes,
          failedNodes: result.failedNodes,
          totalDurationMs: result.totalDurationMs,
          taskStats: result.graph.getStats(),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Plan execution failed" });
    }
  });

  // GET /plan/:id — get plan details
  router.get("/:id", async (req, res) => {
    const plan = plans.get(req.params.id);
    if (!plan) {
      res.status(404).json({ success: false, error: "Plan not found" });
      return;
    }
    if (!(await requirePlanProjectAccess(req, res, plan))) return;

    res.json({
      success: true,
      data: {
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
    });
  });

  return router;
}
