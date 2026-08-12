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
import {
  GameHealthMonitor,
  isAssessed,
} from "../lifecycle/monitor/GameHealthMonitor";
import { LifecycleFeedbackBridge } from "../lifecycle/bridge/LifecycleFeedbackBridge";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";
import type { ProjectAccessControl } from "./projects";

export function createLifecycleRouter(access: ProjectAccessControl): Router {
  const router = Router();
  const controller = new GameLifecycleController();
  const liveUpdate = new LiveUpdateEngine();
  const patchGen = new AutoPatchGenerator();
  const evolution = new ContinuousEvolutionEngine();
  const healthMonitor = new GameHealthMonitor();
  const bridge = new LifecycleFeedbackBridge();

  // POST /lifecycle/start — start lifecycle for a generated game
  router.post("/start", async (req, res) => {
    const { gameId } = req.body;
    if (!gameId) {
      res.status(400).json({ success: false, error: "gameId required" });
      return;
    }
    if (!(await access.requireProjectAccess(req, res, gameId))) return;
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

      if (!blueprint.id || blueprint.id !== gameId) {
        res.status(400).json({
          success: false,
          error: "blueprint.id must match gameId",
        });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, gameId))) return;

      controller.tick(gameId);

      // SIM-TRUTH-1. Everything in the request body is a claim made by the
      // caller. `simulationData.engagementScore` in particular used to be
      // substituted straight into the health computation, so a number the
      // client chose came back as this server's assessment of the game. A
      // client claim is never server-produced evidence, so the simulation
      // signal is withheld: this route holds no simulation run of its own, and
      // the results `/api/simulate` produces live in that router's process-local
      // map, not anywhere this handler can read.
      const clientClaims = {
        simulation: simulationData ?? null,
        economy: economyData ?? null,
        world: worldData ?? null,
      };
      // Every signal is withheld, and that is the honest state of this route
      // rather than an oversight: `simulationData`, `economyData` and
      // `worldData` all arrive in the request body, so none of them is
      // server-produced evidence, and this handler holds no simulation,
      // economy or world run of its own to read instead. Until a server-owned
      // evidence source exists, `/lifecycle/tick` therefore never assesses and
      // never evolves. That is deliberate: the alternative is the behaviour
      // this slice removed, where a caller's number — or a default standing in
      // for one — decided that a game was healthy and patched its blueprint.
      const assessment = healthMonitor.assess(gameId, {
        simulationEvidence: null,
        economyHealth: null,
        worldStability: null,
        anomalyRate: null,
      });

      // Patch sources still carry the caller's data, which is what it is: a
      // claim the caller supplied. The synthesised `health` source is gone,
      // because there is no health figure to derive one from.
      const sources: PatchSource[] = [];
      if (economyData) sources.push({ type: "economy", data: economyData });
      if (simulationData)
        sources.push({ type: "simulation", data: simulationData });
      if (worldData) sources.push({ type: "world", data: worldData });

      const patches = patchGen.generate(sources);

      // Evolution reads a health score and a stagnation flag. With no
      // assessment there is nothing to read, so it does not run: an unassessed
      // game used to reach here with a fabricated 73 and be sent down the
      // "optimize" branch, mutating a blueprint on the strength of a default.
      const evolutionResult = isAssessed(assessment)
        ? evolution.evolve(
            blueprint as RobloxGameBlueprint,
            assessment.composite,
            controller.getLifecycle(gameId)?.tickCount ?? 0,
            assessment.trend === "declining",
          )
        : null;

      const allPatches = [...patches, ...(evolutionResult?.patches ?? [])];
      const patchResult = liveUpdate.applyPatches(
        blueprint as RobloxGameBlueprint,
        allPatches,
      );

      if (allPatches.length > 0) controller.recordPatch(gameId);
      if (isAssessed(assessment)) {
        controller.updateHealth(gameId, assessment.composite);
      }

      const feedback = evolutionResult
        ? await bridge.processFeedback(gameId, assessment, evolutionResult)
        : null;

      // State transitions. `SIMULATED` used to be entered by any tick at all,
      // which asserted a game had been simulated when nothing had simulated it.
      // It is now entered only from server-produced simulation evidence, which
      // no source currently supplies, so a game started here stays in `CREATED`
      // until one exists. The response says so rather than leaving a caller to
      // infer it from a state that never changes.
      const lifecycle = controller.getLifecycle(gameId);
      const advanceBlocked =
        lifecycle?.state === "CREATED" && !isAssessed(assessment);
      if (lifecycle?.state === "SIMULATED" && economyData)
        controller.transition(gameId, "BALANCED");
      if (lifecycle?.state === "BALANCED")
        controller.transition(gameId, "ACTIVE");
      if (
        (evolutionResult?.patches.length ?? 0) > 0 &&
        lifecycle?.state === "ACTIVE"
      ) {
        controller.transition(gameId, "EVOLVING");
      }

      res.json({
        success: true,
        data: {
          lifecycle: controller.getLifecycle(gameId),
          lifecycleAdvance: advanceBlocked
            ? {
                advanced: false,
                blockedFrom: "CREATED",
                reason:
                  "Advancing past CREATED requires server-produced simulation evidence, which no source supplies today. A tick that simulated nothing does not make a game SIMULATED.",
              }
            : { advanced: true },
          health: assessment,
          clientClaims,
          patches: { total: allPatches.length, applied: patchResult.applied },
          evolution: evolutionResult
            ? {
                ran: true,
                type: evolutionResult.evolutionType,
                reason: evolutionResult.reason,
              }
            : {
                ran: false,
                abstained: true,
                reason: isAssessed(assessment)
                  ? "No evolution was attempted"
                  : assessment.reason,
              },
          feedback,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Lifecycle tick failed" });
    }
  });

  // POST /lifecycle/patch — manually apply patches
  router.post("/patch", async (req, res) => {
    try {
      const { blueprint, patches } = req.body;
      if (!blueprint || !patches) {
        res
          .status(400)
          .json({ success: false, error: "blueprint and patches required" });
        return;
      }
      if (!blueprint.id) {
        res
          .status(400)
          .json({ success: false, error: "blueprint.id required" });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;
      const result = liveUpdate.applyPatches(blueprint, patches);
      res.json({ success: true, data: result });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Patch application failed" });
    }
  });

  // GET /lifecycle/status/:gameId — get lifecycle status
  router.get("/status/:gameId", async (req, res) => {
    if (!(await access.requireProjectAccess(req, res, req.params.gameId)))
      return;
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
