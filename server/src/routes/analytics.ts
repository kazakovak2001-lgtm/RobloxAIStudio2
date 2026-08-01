/**
 * analytics.routes.ts
 *
 * API endpoints for execution analytics and feedback loop.
 *
 * Endpoints:
 *   GET  /api/analytics/system         — system health report
 *   GET  /api/analytics/agents         — all agent performance summaries
 *   GET  /api/analytics/agent/:name    — single agent performance
 *   GET  /api/analytics/execution/:id  — execution efficiency analysis
 *   GET  /api/analytics/patterns       — detected failure patterns
 *   GET  /api/analytics/signals        — feedback signals
 *   GET  /api/analytics/suggestions    — optimization suggestions
 *   POST /api/analytics/cycle          — trigger feedback cycle
 *   GET  /api/analytics/slowest        — slowest agents
 *   GET  /api/analytics/lowest-scores  — lowest scoring agents
 */

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { FeedbackLoopPipeline } from "../core/analytics/FeedbackLoopPipeline";

function requireAnalyticsOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  const operatorIds = new Set(
    (process.env.ANALYTICS_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;
  if (!userId || !operatorIds.has(userId)) {
    res
      .status(403)
      .json({ success: false, error: "Analytics operator access required" });
    return;
  }
  next();
}

export function createAnalyticsRouter(): Router {
  const router = Router();
  const pipeline = new FeedbackLoopPipeline();

  router.use(requireAnalyticsOperator);

  // GET /system — system health report
  router.get("/system", (_req, res) => {
    const health = pipeline.getSystemHealth();
    res.json({
      success: true,
      data: {
        ...health,
        cycleCount: pipeline.getCycleCount(),
        lastCycleAt: pipeline.getLastCycleAt(),
        recordCount: pipeline.getAnalytics().recordCount,
        signalCount: pipeline.getFeedbackEngine().signalCount,
      },
    });
  });

  // GET /agents — all agent summaries
  router.get("/agents", (_req, res) => {
    const summaries = pipeline.getAnalytics().getAllAgentSummaries();
    res.json({
      success: true,
      data: { count: summaries.length, agents: summaries },
    });
  });

  // GET /agent/:name — single agent performance
  router.get("/agent/:name", (req, res) => {
    const summary = pipeline.getAnalytics().getAgentSummary(req.params.name);
    if (!summary) {
      res
        .status(404)
        .json({ success: false, error: "Agent not found in analytics" });
      return;
    }

    const patterns = pipeline
      .getPatternDetector()
      .getPatternsForAgent(req.params.name);
    const signal = pipeline
      .getFeedbackEngine()
      .getLatestSignal(req.params.name);

    res.json({
      success: true,
      data: { summary, patterns, latestSignal: signal },
    });
  });

  // GET /execution/:id — execution efficiency
  router.get("/execution/:id", (req, res) => {
    const report = pipeline.getAnalytics().analyzeExecution(req.params.id);
    if (!report) {
      res.status(404).json({ success: false, error: "Execution not found" });
      return;
    }
    res.json({ success: true, data: report });
  });

  // GET /patterns — detected failure patterns
  router.get("/patterns", (req, res) => {
    const severity = req.query.severity as string | undefined;
    let patterns = pipeline.getPatternDetector().getPatterns();
    if (severity) {
      patterns = patterns.filter((p) => p.severity === severity);
    }
    res.json({
      success: true,
      data: { count: patterns.length, patterns },
    });
  });

  // GET /signals — feedback signals
  router.get("/signals", (req, res) => {
    const type = req.query.type as string | undefined;
    let signals = pipeline.getFeedbackEngine().getAllSignals();
    if (type) {
      signals = signals.filter((s) => s.type === type);
    }
    res.json({
      success: true,
      data: { count: signals.length, signals: signals.slice(-100) },
    });
  });

  // GET /suggestions — optimization suggestions
  router.get("/suggestions", (req, res) => {
    const priority = req.query.priority as string | undefined;
    let suggestions = pipeline.getOptimizationEngine().getSuggestions();
    if (priority) {
      suggestions = suggestions.filter((s) => s.priority === priority);
    }
    res.json({
      success: true,
      data: { count: suggestions.length, suggestions },
    });
  });

  // POST /cycle — trigger a feedback loop cycle
  router.post("/cycle", (_req, res) => {
    const result = pipeline.runCycle();
    res.json({
      success: true,
      data: {
        ingested: result.ingested,
        agentsAnalyzed: result.agentSummaries.length,
        patternsDetected: result.patterns.length,
        signalsGenerated: result.signals.length,
        suggestionsCreated: result.suggestions.length,
        systemHealth: result.systemHealth,
      },
    });
  });

  // GET /slowest — slowest agents
  router.get("/slowest", (req, res) => {
    const n = parseInt(req.query.n as string) || 5;
    const slowest = pipeline.getAnalytics().getSlowestAgents(n);
    res.json({ success: true, data: slowest });
  });

  // GET /lowest-scores — lowest scoring agents
  router.get("/lowest-scores", (req, res) => {
    const n = parseInt(req.query.n as string) || 5;
    const lowest = pipeline.getAnalytics().getLowestScoringAgents(n);
    res.json({ success: true, data: lowest });
  });

  return router;
}
