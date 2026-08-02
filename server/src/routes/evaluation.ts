/**
 * evaluation.routes.ts
 *
 * API exposure layer for the evaluation system.
 * Endpoints: score per agent, history, run regression suite.
 */

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { AgentEvaluator } from "../evaluation/agents/AgentEvaluator";
import { EvaluationAggregator } from "../evaluation/analytics/EvaluationAggregator";
import { EvaluationSuite } from "../evaluation/regression/EvaluationSuite";
import { getAllDatasets } from "../evaluation/datasets/PromptDataset";
import { AgentRegistry } from "../agents/core/AgentRegistry";

function requireEvaluationOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  const operatorIds = new Set(
    (process.env.EVALUATION_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;
  if (!userId || !operatorIds.has(userId)) {
    res.status(403).json({
      success: false,
      error: "Evaluation operator access required",
    });
    return;
  }
  next();
}

export function createEvaluationRouter(agentRegistry: AgentRegistry): Router {
  const router = Router();
  const evaluator = new AgentEvaluator();
  const aggregator = new EvaluationAggregator();
  const suite = new EvaluationSuite();

  // GET /evaluation/score/:agent — get current score summary for an agent
  router.get("/score/:agent", requireEvaluationOperator, (_req, res) => {
    const agentType = _req.params.agent;
    const summary = aggregator.getSummary(agentType);
    if (!summary) {
      res.json({
        success: true,
        data: { agentType, message: "No evaluations yet" },
      });
      return;
    }
    res.json({ success: true, data: summary });
  });

  // GET /evaluation/history — get all evaluation summaries
  router.get("/history", requireEvaluationOperator, (_req, res) => {
    const summaries = aggregator.getAllSummaries();
    const alerts = aggregator.getAlerts();
    res.json({
      success: true,
      data: {
        summaries,
        alerts,
        totalEvaluations: evaluator.getHistory().length,
      },
    });
  });

  // POST /evaluation/run — run the full regression suite
  router.post("/run", requireEvaluationOperator, async (_req, res) => {
    try {
      const datasets = getAllDatasets();
      const result = await suite.run(datasets, async (agentType, input) => {
        const output = await agentRegistry.executeAgent(agentType, input);
        const { evaluation } = await evaluator.evaluate(agentType, output);
        aggregator.addResult(evaluation);
        return output;
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Evaluation suite failed" });
    }
  });

  // GET /evaluation/alerts — get drift/regression alerts
  router.get("/alerts", requireEvaluationOperator, (_req, res) => {
    res.json({ success: true, data: aggregator.getAlerts() });
  });

  return router;
}
