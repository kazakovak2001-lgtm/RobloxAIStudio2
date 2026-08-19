/**
 * world.routes.ts
 *
 * API layer for World Intelligence.
 */

import { Router } from "express";
import { WorldStateEngine } from "../world/core/WorldStateEngine";
import { NPCBehaviorEngine } from "../world/npc/NPCBehaviorEngine";
import { InteractionGraphEngine } from "../world/interaction/InteractionGraphEngine";
import { EmergentBehaviorEngine } from "../world/emergence/EmergentBehaviorEngine";
import { WorldMutationEngine } from "../world/mutation/WorldMutationEngine";
import { WorldSimulationBridge } from "../world/bridge/WorldSimulationBridge";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";
import type { ProjectAccessControl } from "./projects";
import { requireApiKeyCapability } from "../common/middleware/security";
import { requireProjectAccessForBlueprint } from "./resourceAuthorization";

export function createWorldRouter(access: ProjectAccessControl): Router {
  const router = Router();
  const npcEngine = new NPCBehaviorEngine();
  const interactionGraph = new InteractionGraphEngine();
  const emergenceEngine = new EmergentBehaviorEngine();
  const mutationEngine = new WorldMutationEngine();
  const bridge = new WorldSimulationBridge();

  // POST /world/simulate — run full world simulation
  router.post("/simulate", async (req, res) => {
    try {
      const blueprint = req.body.blueprint as RobloxGameBlueprint;
      const ticks = req.body.ticks ?? 50;
      if (
        !(await requireProjectAccessForBlueprint(access, req, res, blueprint, {
          missingBlueprintMessage: "Blueprint required",
        }))
      ) {
        return;
      }

      const world = new WorldStateEngine();
      world.initialize(blueprint.npcs, blueprint.world.biomes);

      // Run ticks
      for (let t = 0; t < ticks; t++) {
        world.tick();
        const npcs = world.getEntitiesByType("npc");
        const player = world.getEntity("player-sim");
        const actions = npcEngine.computeActions(
          npcs,
          player,
          world.currentTick,
        );

        // Record interactions
        for (const action of actions) {
          if (action.target) {
            interactionGraph.recordInteraction(
              action.npcId,
              action.target,
              action.action,
              world.currentTick,
            );
          }
          // Update NPC state
          world.updateEntity(action.npcId, {
            lastAction: action.action,
            interactions:
              Number(world.getEntity(action.npcId)?.state.interactions ?? 0) +
              1,
          });
        }
      }

      // Analyze
      const graph = interactionGraph.analyze();
      const emergence = emergenceEngine.detect(world.getState(), graph);
      const mutations = mutationEngine.applyMutations(world, emergence);
      const feedback = await bridge.processFeedback(
        blueprint.id,
        emergence,
        mutations,
      );

      res.json({
        success: true,
        data: {
          ticks: world.currentTick,
          entities: world.entityCount,
          graph: {
            edges: graph.edges.length,
            totalInteractions: graph.totalInteractions,
            dominantLoop: graph.dominantLoop,
          },
          emergence: {
            phenomena: emergence.totalDetected,
            stability: emergence.worldStability,
            high: emergence.highSeverity,
          },
          mutations: mutations.filter((m) => m.applied).length,
          feedback,
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "World simulation failed" });
    }
  });

  // POST /world/tick — run a single tick (for incremental simulation)
  router.post("/tick", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.world.tick.metadata.read",
        "placeholder-metadata",
      )
    ) {
      return;
    }
    try {
      // Single-tick mode would require persistent world state (future)
      res.json({
        success: true,
        data: { message: "Single-tick mode — use /world/simulate for batch" },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Tick failed" });
    }
  });

  // GET /world/state/:gameId — placeholder
  router.get("/state/:gameId", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.world.state.metadata.read",
        "placeholder-metadata",
      )
    ) {
      return;
    }
    res.json({
      success: true,
      data: {
        message: "World state stored in Memory v0.6 — use /api/memory/search",
      },
    });
  });

  // GET /world/emergence/:gameId — placeholder
  router.get("/emergence/:gameId", (req, res) => {
    if (
      !requireApiKeyCapability(
        req,
        res,
        "system.world.emergence.metadata.read",
        "placeholder-metadata",
      )
    ) {
      return;
    }
    res.json({
      success: true,
      data: {
        message:
          "Emergence data stored in Memory v0.6 — use /api/memory/search",
      },
    });
  });

  return router;
}
