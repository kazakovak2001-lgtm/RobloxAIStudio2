/**
 * simulation.routes.ts
 *
 * API layer for AI Playtesting & Simulation.
 */

import { Router } from "express";
import { GameSimulationEngine } from "../simulation/core/GameSimulationEngine";
import { PlaytestAgent } from "../simulation/agents/PlaytestAgent";
import { GameplayMetricsEngine } from "../simulation/metrics/GameplayMetricsEngine";
import { SimulationFeedbackEngine } from "../simulation/feedback/SimulationFeedbackEngine";
import { GenerationRefinementBridge } from "../simulation/bridge/GenerationRefinementBridge";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";

export function createSimulationRouter(): Router {
  const router = Router();
  const simEngine = new GameSimulationEngine();
  const playtester = new PlaytestAgent();
  const metricsEngine = new GameplayMetricsEngine();
  const feedbackEngine = new SimulationFeedbackEngine();
  const refinement = new GenerationRefinementBridge();

  // Store simulation results for retrieval
  const results = new Map<
    string,
    { simulation: any; report: any; metrics: any; feedback: any }
  >();

  // POST /simulate/game — run full simulation pipeline on a blueprint
  router.post("/game", async (req, res) => {
    try {
      const blueprint = req.body.blueprint as RobloxGameBlueprint;
      if (!blueprint?.id) {
        res
          .status(400)
          .json({ success: false, error: "Blueprint with id required" });
        return;
      }

      const ticks = req.body.ticks ?? 100;

      // 1. Simulate
      const simulation = simEngine.simulateGame(blueprint, ticks);

      // 2. Playtest analysis
      const report = playtester.analyze(blueprint, simulation);

      // 3. Extract metrics
      const metrics = metricsEngine.extract(simulation);

      // 4. Generate feedback
      const feedback = feedbackEngine.generateFeedback(report, metrics);

      // 5. Refinement decision
      const decision = await refinement.processFeedback(feedback);

      // Store for retrieval
      results.set(blueprint.id, { simulation, report, metrics, feedback });

      res.json({
        success: true,
        data: {
          simulation: {
            ticks: simulation.totalTicks,
            completed: simulation.completed,
          },
          report: {
            engagementScore: report.engagementScore,
            issues: report.issues.length,
            suggestions: report.suggestions,
          },
          metrics,
          feedback: {
            grade: feedback.overallGrade,
            shouldRegenerate: feedback.shouldRegenerate,
            items: feedback.items.length,
          },
          decision,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Simulation failed" });
    }
  });

  // POST /simulate/run — run simulation only (no analysis)
  router.post("/run", (req, res) => {
    try {
      const blueprint = req.body.blueprint as RobloxGameBlueprint;
      const ticks = req.body.ticks ?? 50;
      const simulation = simEngine.simulateGame(blueprint, ticks);
      res.json({ success: true, data: simulation });
    } catch (error) {
      res.status(500).json({ success: false, error: "Simulation run failed" });
    }
  });

  // GET /simulate/metrics/:gameId — get stored metrics
  router.get("/metrics/:gameId", (req, res) => {
    const stored = results.get(req.params.gameId);
    if (!stored) {
      res.status(404).json({ success: false, error: "No simulation data" });
      return;
    }
    res.json({ success: true, data: stored.metrics });
  });

  // POST /simulate/feedback — get feedback for an existing simulation
  router.post("/feedback", (req, res) => {
    const { report, metrics } = req.body;
    if (!report || !metrics) {
      res
        .status(400)
        .json({ success: false, error: "report and metrics required" });
      return;
    }
    const feedback = feedbackEngine.generateFeedback(report, metrics);
    res.json({ success: true, data: feedback });
  });

  return router;
}
