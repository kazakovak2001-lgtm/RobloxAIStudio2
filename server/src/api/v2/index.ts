/**
 * API v2 — Experimental Features
 *
 * Endpoints under /api/v2/* are NOT contract-locked.
 * They may change without notice between releases.
 *
 * Currently exposes:
 *   /api/v2/compile/stream  — streamed compile with SSE
 *   /api/v2/plan/dag        — full DAG introspection
 */

import { Router } from "express";
import { ApiGateway, type RequestWithTrace } from "../gateway/ApiGateway";
import { ResponseFormatter } from "../gateway/ResponseFormatter";
import { PlannerEngine } from "../../planning/core/PlannerEngine";
import { PlanExecutor } from "../../planning/execution/PlanExecutor";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { ExecutionTracer } from "../../core/observability/ExecutionTracer";
import type { ExecutionTraceEvent } from "../../core/observability/types";
import type { ProjectAccessControl } from "../../routes/projects";

export function createV2Router(
  agentRegistry: AgentRegistry,
  gateway: ApiGateway,
  access: ProjectAccessControl,
): Router {
  const router = gateway.createVersionedRouter("v2");
  const formatter = new ResponseFormatter("2.0.0-experimental");

  // ─── POST /compile/stream — compile with SSE streaming ─────────────────
  router.post("/compile/stream", async (req, res) => {
    const traceId = (req as RequestWithTrace).traceId;
    const projectId = req.body.projectId;
    if (!projectId || typeof projectId !== "string") {
      res
        .status(400)
        .json(
          formatter.error(
            "PROJECT_ID_REQUIRED",
            "projectId is required",
            undefined,
            { traceId },
          ),
        );
      return;
    }
    if (!(await access.requireProjectAccess(req, res, projectId))) return;

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Trace-Id", traceId);
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const tracer = ExecutionTracer.instance();
    let listener: ((event: ExecutionTraceEvent) => void) | undefined;

    try {
      const { intent, constraints } = req.body;

      sendEvent("start", { traceId, intent });

      const planner = new PlannerEngine();
      const executor = new PlanExecutor();
      const plan = planner.createPlan({
        intent: intent ?? "Generate a Roblox game",
        constraints: constraints ?? [],
        projectId,
      });

      // SEC-REALTIME-TRACE-001. The tracer is process-wide, so an unfiltered
      // listener streamed every concurrent execution's trace to this response,
      // including other tenants'. The caller asked about the plan it just
      // created, so the stream is restricted to that execution, and to the
      // project it was authorized for. Registering after the plan exists is
      // what makes the narrower filter possible.
      listener = (event: ExecutionTraceEvent) => {
        if (event.executionId !== plan.planId) return;
        if (event.projectId && event.projectId !== projectId) return;
        sendEvent("trace", {
          type: event.eventType,
          node: event.nodeId,
          agent: event.agentId,
          durationMs: event.durationMs,
          score: event.evaluationScore,
          error: event.error,
        });
      };
      tracer.addListener(listener);

      sendEvent("plan.created", {
        planId: plan.planId,
        tasks: plan.estimatedSteps,
      });

      const result = await executor.executePlan(
        plan.planId,
        plan.graph,
        (agent, input) => agentRegistry.executeAgent(agent, input),
        { projectId, stopOnFailure: false },
      );

      sendEvent("complete", {
        success: result.success,
        completedNodes: result.completedNodes,
        failedNodes: result.failedNodes,
        totalDurationMs: result.totalDurationMs,
      });
    } catch (err) {
      sendEvent("error", {
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      if (listener) tracer.removeListener(listener);
      res.end();
    }
  });

  // ─── POST /plan/dag — full DAG with dependencies visible ───────────────
  router.post("/plan/dag", async (req, res) => {
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
        intent: req.body.intent ?? "Generate a Roblox game",
        constraints: req.body.constraints ?? [],
        projectId,
      });

      const nodes = plan.graph.getAllNodes();
      const edges: Array<{ from: string; to: string }> = [];
      for (const node of nodes) {
        for (const dep of node.dependencies) {
          edges.push({ from: dep, to: node.id });
        }
      }

      res.json(
        formatter.success(
          {
            planId: plan.planId,
            dag: {
              nodes: nodes.map((n) => ({
                id: n.id,
                agent: n.agent,
                type: n.type,
                dependencies: n.dependencies,
              })),
              edges,
              size: nodes.length,
            },
          },
          { traceId, startTime },
        ),
      );
    } catch (err) {
      res
        .status(500)
        .json(
          formatter.error(
            "DAG_FAILED",
            "DAG creation failed",
            err instanceof Error ? err.message : undefined,
            { traceId },
          ),
        );
    }
  });

  // ─── GET /status ───────────────────────────────────────────────────────
  router.get("/status", (req, res) => {
    const traceId = (req as RequestWithTrace).traceId;
    res.json(
      formatter.success(
        {
          version: "2.0.0-experimental",
          stability: "EXPERIMENTAL",
          notice:
            "v2 endpoints may change without notice. Use v1 for production.",
        },
        { traceId },
      ),
    );
  });

  return router;
}
