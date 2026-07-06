/**
 * debug.routes.ts
 *
 * Execution observability API endpoints.
 * Provides introspection into PlanExecutor traces, execution graphs,
 * and replay data.
 *
 * Endpoints:
 *   GET /api/debug/executions              — list all traced executions
 *   GET /api/debug/execution/:id           — full execution trace
 *   GET /api/debug/trace/:id               — events timeline for an execution
 *   GET /api/debug/graph/:id               — DAG visualization data
 *   GET /api/debug/replay/:id              — step-by-step replay data
 *   GET /api/debug/compare/:idA/:idB       — A/B comparison of two executions
 *   GET /api/debug/timeline/:id            — chronological timeline
 *   DELETE /api/debug/execution/:id        — delete a trace
 */

import { Router } from "express";
import { TraceStore } from "../core/observability/TraceStore";
import { ExecutionGraphBuilder } from "../core/observability/ExecutionGraphBuilder";
import { ExecutionReplayEngine } from "../core/observability/ExecutionReplayEngine";

export function createDebugRouter(): Router {
  const router = Router();
  const store = TraceStore.instance();
  const graphBuilder = new ExecutionGraphBuilder(store);
  const replayEngine = new ExecutionReplayEngine(store);

  // GET /executions — list all traced executions
  router.get("/executions", (_req, res) => {
    const traces = store.listTraces().map((t) => ({
      executionId: t.executionId,
      planId: t.planId,
      goal: t.goal,
      status: t.status,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      totalDurationMs: t.totalDurationMs,
      nodeCount: t.nodeCount,
      completedNodes: t.completedNodes,
      failedNodes: t.failedNodes,
      eventCount: t.events.length,
    }));

    res.json({ count: traces.length, executions: traces });
  });

  // GET /execution/:id — full execution trace
  router.get("/execution/:id", (req, res) => {
    const trace = store.getTrace(req.params.id);
    if (!trace) {
      res.status(404).json({ error: "Execution trace not found" });
      return;
    }
    res.json(trace);
  });

  // GET /trace/:id — events timeline
  router.get("/trace/:id", (req, res) => {
    const trace = store.getTrace(req.params.id);
    if (!trace) {
      res.status(404).json({ error: "Execution trace not found" });
      return;
    }

    const nodeFilter = req.query.node as string | undefined;
    const typeFilter = req.query.type as string | undefined;

    let events = trace.events;
    if (nodeFilter) {
      events = events.filter((e) => e.nodeId === nodeFilter);
    }
    if (typeFilter) {
      events = events.filter((e) => e.eventType === typeFilter);
    }

    res.json({
      executionId: trace.executionId,
      status: trace.status,
      eventCount: events.length,
      events,
    });
  });

  // GET /graph/:id — DAG visualization
  router.get("/graph/:id", (req, res) => {
    const graph = graphBuilder.buildFromTrace(req.params.id);
    if (!graph) {
      res.status(404).json({ error: "Execution trace not found" });
      return;
    }

    res.json({
      ...graph,
      flowText: graphBuilder.buildFlowText(req.params.id),
      canonicalPath: graphBuilder.getExecutionPath(),
    });
  });

  // GET /replay/:id — step-by-step replay data
  router.get("/replay/:id", (req, res) => {
    const steps = replayEngine.getReplayData(req.params.id);
    if (!steps) {
      res.status(404).json({ error: "Execution trace not found" });
      return;
    }

    res.json({
      executionId: req.params.id,
      stepCount: steps.length,
      steps,
    });
  });

  // GET /compare/:idA/:idB — A/B execution comparison
  router.get("/compare/:idA/:idB", (req, res) => {
    const result = replayEngine.compareExecutions(
      req.params.idA,
      req.params.idB,
    );
    if (!result) {
      res.status(404).json({ error: "One or both execution traces not found" });
      return;
    }

    res.json({
      executionA: req.params.idA,
      executionB: req.params.idB,
      ...result,
    });
  });

  // GET /timeline/:id — chronological timeline
  router.get("/timeline/:id", (req, res) => {
    const timeline = graphBuilder.buildTimeline(req.params.id);
    if (timeline.length === 0) {
      res.status(404).json({ error: "Execution trace not found or empty" });
      return;
    }

    res.json({
      executionId: req.params.id,
      entries: timeline.length,
      timeline,
    });
  });

  // DELETE /execution/:id — remove a trace
  router.delete("/execution/:id", (req, res) => {
    const deleted = store.deleteTrace(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Execution trace not found" });
      return;
    }
    res.json({ deleted: true, executionId: req.params.id });
  });

  // GET /export/:id — export full trace as JSON download
  router.get("/export/:id", (req, res) => {
    const exportData = replayEngine.exportForReplay(req.params.id);
    if (!exportData) {
      res.status(404).json({ error: "Execution trace not found" });
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="trace-${req.params.id}.json"`,
    );
    res.json(exportData);
  });

  return router;
}
