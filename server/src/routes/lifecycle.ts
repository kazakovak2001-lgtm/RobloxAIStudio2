/**
 * lifecycle.routes.ts
 *
 * API layer for Autonomous Game Lifecycle System.
 */

import { Router } from "express";
import { GameLifecycleController } from "../lifecycle/core/GameLifecycleController";
import { LiveUpdateEngine } from "../lifecycle/live/LiveUpdateEngine";
import {
  AutoPatchGenerator,
  type PatchSource,
} from "../lifecycle/patch/AutoPatchGenerator";
import { ContinuousEvolutionEngine } from "../lifecycle/evolution/ContinuousEvolutionEngine";
import { GameHealthMonitor } from "../lifecycle/monitor/GameHealthMonitor";
import { LifecycleFeedbackBridge } from "../lifecycle/bridge/LifecycleFeedbackBridge";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";

export function createLifecycleRouter(): Router {
  const router = Router();
  const controller = new GameLifecycleController();
  const liveUpdate = new LiveUpdateEngine();
  const patchGen = new AutoPatchGenerator();
  const evolution = new ContinuousEvolutionEngine();
  const healthMonitor = new GameHealthMonitor();
  const bridge = new LifecycleFeedbackBridge();

  // POST /lifecycle/start — start lifecycle for a generated game
  router.post("/start", (req, res) => {
    const { gameId } = req.body;
    if (!gameId) {
      res.status(400).json({ success: false, error: "gameId required" });
      return;
    }
    const lifecycle = controller.start(gameId);
    res.json({ success: true, data: lifecycle });
  });

  // POST /lifecycle/tick — run one lifecycle maintenance cycle
  router.post("/tick", async (req, res) => {
    try {
      const { gameId, blueprint, simulationData, economyData, worldData } =
        req.body;
      if (!gameId || !blueprint) {
        res
          .status(400)
          .json({ success: false, error: "gameId and blueprint required" });
        return;
      }

      controller.tick(gameId);

      // Compute health
      const health = healthMonitor.computeHealth(
        gameId,
        Number(simulationData?.engagementScore ?? 70),
        Number(economyData?.healthScore ?? 70),
        Number(worldData?.stability ?? 70),
        Number(worldData?.anomalyRate ?? 10),
      );

      // Generate patches from all sources
      const sources: PatchSource[] = [];
      if (economyData) sources.push({ type: "economy", data: economyData });
      if (simulationData)
        sources.push({ type: "simulation", data: simulationData });
      if (worldData) sources.push({ type: "world", data: worldData });
      sources.push({ type: "health", data: { healthScore: health.overall } });

      const patches = patchGen.generate(sources);

      // Evolve if needed
      const evolutionResult = evolution.evolve(
        blueprint as RobloxGameBlueprint,
        health.overall,
        controller.getLifecycle(gameId)?.tickCount ?? 0,
        health.trend === "declining",
      );

      // Apply patches + evolution
      const allPatches = [...patches, ...evolutionResult.patches];
      const patchResult = liveUpdate.applyPatches(
        blueprint as RobloxGameBlueprint,
        allPatches,
      );

      // Record
      if (allPatches.length > 0) controller.recordPatch(gameId);
      controller.updateHealth(gameId, health.overall);

      // Feedback
      const feedback = await bridge.processFeedback(
        gameId,
        health,
        evolutionResult,
      );

      // State transitions
      const lifecycle = controller.getLifecycle(gameId);
      if (lifecycle?.state === "CREATED")
        controller.transition(gameId, "SIMULATED");
      if (lifecycle?.state === "SIMULATED" && economyData)
        controller.transition(gameId, "BALANCED");
      if (lifecycle?.state === "BALANCED")
        controller.transition(gameId, "ACTIVE");
      if (evolutionResult.patches.length > 0 && lifecycle?.state === "ACTIVE") {
        controller.transition(gameId, "EVOLVING");
      }

      res.json({
        success: true,
        data: {
          lifecycle: controller.getLifecycle(gameId),
          health,
          patches: { total: allPatches.length, applied: patchResult.applied },
          evolution: {
            type: evolutionResult.evolutionType,
            reason: evolutionResult.reason,
          },
          feedback,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Lifecycle tick failed" });
    }
  });

  // POST /lifecycle/patch — manually apply patches
  router.post("/patch", (req, res) => {
    try {
      const { blueprint, patches } = req.body;
      if (!blueprint || !patches) {
        res
          .status(400)
          .json({ success: false, error: "blueprint and patches required" });
        return;
      }
      const result = liveUpdate.applyPatches(blueprint, patches);
      res.json({ success: true, data: result });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Patch application failed" });
    }
  });

  // GET /lifecycle/status/:gameId — get lifecycle status
  router.get("/status/:gameId", (req, res) => {
    const lifecycle = controller.getLifecycle(req.params.gameId);
    const health = healthMonitor.getLatest(req.params.gameId);
    if (!lifecycle) {
      res.status(404).json({ success: false, error: "Game not found" });
      return;
    }
    res.json({
      success: true,
      data: {
        lifecycle,
        health,
        needsIntervention: healthMonitor.needsIntervention(req.params.gameId),
      },
    });
  });

  return router;
}
