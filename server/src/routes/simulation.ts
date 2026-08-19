/**
 * simulation.routes.ts
 *
 * API layer for AI Playtesting & Simulation.
 */

import { Router } from "express";
import { GameSimulationEngine } from "../simulation/core/GameSimulationEngine";
import {
  PlaytestAgent,
  decodeSimulationEvidenceReport,
} from "../simulation/agents/PlaytestAgent";
import { GameplayMetricsEngine } from "../simulation/metrics/GameplayMetricsEngine";
import { SimulationFeedbackEngine } from "../simulation/feedback/SimulationFeedbackEngine";
import { GenerationRefinementBridge } from "../simulation/bridge/GenerationRefinementBridge";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";
import type { ProjectAccessControl } from "./projects";
import { requireApiKeyCapability } from "../common/middleware/security";
import { requireProjectAccessForBlueprint } from "./resourceAuthorization";

export function createSimulationRouter(access: ProjectAccessControl): Router {
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
      if (
        !(await requireProjectAccessForBlueprint(access, req, res, blueprint))
      ) {
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
          // SIM-TRUTH-1. The evidence kind, the observed facts and the derived
          // ratios are reported as three separate things, and no aggregate is
          // offered. `player` states that none was observed.
          report: {
            schemaVersion: report.schemaVersion,
            evidenceKind: report.evidenceKind,
            observed: report.observed,
            derived: report.derived,
            player: report.player,
            findings: report.findings,
            suggestions: report.suggestions,
          },
          metrics,
          feedback: {
            decision: feedback.decision,
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
  router.post("/run", async (req, res) => {
    try {
      const blueprint = req.body.blueprint as RobloxGameBlueprint;
      if (
        !(await requireProjectAccessForBlueprint(access, req, res, blueprint))
      ) {
        return;
      }
      const ticks = req.body.ticks ?? 50;
      const simulation = simEngine.simulateGame(blueprint, ticks);
      res.json({ success: true, data: simulation });
    } catch (error) {
      res.status(500).json({ success: false, error: "Simulation run failed" });
    }
  });

  // GET /simulate/metrics/:gameId — get stored metrics
  router.get("/metrics/:gameId", async (req, res) => {
    const gameId = req.params.gameId;
    const stored = results.get(gameId);
    if (!stored) {
      res.status(404).json({ success: false, error: "No simulation data" });
      return;
    }
    if (access.hasProjectAccess) {
      if (!(await access.hasProjectAccess(req, gameId))) {
        res.status(404).json({ success: false, error: "No simulation data" });
        return;
      }
    } else if (!(await access.requireProjectAccess(req, res, gameId))) {
      return;
    }
    res.json({ success: true, data: stored.metrics });
  });

  // POST /simulate/feedback — get feedback for an existing simulation
  router.post("/feedback", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.simulation.feedback.analyze",
        "request-simulation-report",
      )
    ) {
      return;
    }
    const { report, metrics } = req.body;
    if (!report || !metrics) {
      res
        .status(400)
        .json({ success: false, error: "report and metrics required" });
      return;
    }
    // SIM-TRUTH-1. The report arrives from the caller, so it is decoded before
    // it is read. A record predating this contract carries `issues` and an
    // `engagementScore` and no `findings`; it used to throw here, and accepting
    // it would promote a number that never measured anything into evidence.
    const decoded = decodeSimulationEvidenceReport(report);
    if (!decoded) {
      res.status(400).json({
        success: false,
        error:
          "report must be a simulation evidence report on the current schema version and evidence kind; legacy scored reports are not accepted",
      });
      return;
    }
    const feedback = feedbackEngine.generateFeedback(decoded, metrics);
    res.json({ success: true, data: feedback });
  });

  return router;
}
