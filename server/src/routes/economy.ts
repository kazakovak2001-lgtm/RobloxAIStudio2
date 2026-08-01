/**
 * economy.routes.ts
 *
 * API layer for Economy & Balance Intelligence.
 */

import { Router } from "express";
import { EconomyModelEngine } from "../economy/core/EconomyModelEngine";
import { EconomySimulationEngine } from "../economy/simulation/EconomySimulationEngine";
import { ImbalanceDetector } from "../economy/detection/ImbalanceDetector";
import { BalanceGenerator } from "../economy/balancing/BalanceGenerator";
import { EconomyFeedbackBridge } from "../economy/bridge/EconomyFeedbackBridge";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";
import type { ProjectAccessControl } from "./projects";
import { requireApiKeyCapability } from "../common/middleware/security";

export function createEconomyRouter(access: ProjectAccessControl): Router {
  const router = Router();
  const modelEngine = new EconomyModelEngine();
  const simEngine = new EconomySimulationEngine();
  const detector = new ImbalanceDetector();
  const balancer = new BalanceGenerator();
  const bridge = new EconomyFeedbackBridge();

  // POST /economy/analyze — full pipeline: model → simulate → detect → balance → feedback
  router.post("/analyze", async (req, res) => {
    try {
      const blueprint = req.body.blueprint as RobloxGameBlueprint;
      if (!blueprint?.id) {
        res.status(400).json({ success: false, error: "Blueprint required" });
        return;
      }

      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;

      const model = modelEngine.parse(blueprint);
      const simulation = simEngine.simulate(model, req.body.ticks ?? 200);
      const report = detector.detect(model, simulation);
      const patch = balancer.generate(report);
      const feedback = await bridge.processFeedback(report, patch);

      res.json({
        success: true,
        data: {
          model: {
            currency: model.currency,
            stability: model.stabilityIndex,
            netFlow: model.netFlowPerTick,
          },
          simulation: {
            ticks: simulation.ticks,
            finalBalance: simulation.finalBalance,
            growthRate: simulation.growthRate,
          },
          report: {
            healthScore: report.healthScore,
            imbalances: report.imbalances.length,
            critical: report.critical,
          },
          patch: {
            adjustments: patch.adjustments.length,
            confidence: patch.confidence,
          },
          feedback,
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Economy analysis failed" });
    }
  });

  // POST /economy/simulate — simulation only
  router.post("/simulate", async (req, res) => {
    try {
      const blueprint = req.body.blueprint as RobloxGameBlueprint;
      if (!blueprint?.id) {
        res.status(400).json({ success: false, error: "Blueprint required" });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;
      const model = modelEngine.parse(blueprint);
      const result = simEngine.simulate(model, req.body.ticks ?? 200);
      res.json({ success: true, data: result });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Economy simulation failed" });
    }
  });

  // POST /economy/balance — get balance patch for a report
  router.post("/balance", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.economy.balance.execute",
        "request-economy-report",
      )
    ) {
      return;
    }
    try {
      const report = req.body.report;
      if (!report) {
        res.status(400).json({ success: false, error: "Report required" });
        return;
      }
      const patch = balancer.generate(report);
      res.json({ success: true, data: patch });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Balance generation failed" });
    }
  });

  // GET /economy/report/:gameId — placeholder for stored reports
  router.get("/report/:gameId", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.economy.report.metadata.read",
        "placeholder-metadata",
      )
    ) {
      return;
    }
    res.json({
      success: true,
      data: {
        message:
          "Economy reports stored in Memory v0.6 — use /api/memory/search",
      },
    });
  });

  return router;
}
