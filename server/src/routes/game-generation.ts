import { Router } from "express";
import { GameGenerationService } from "../projects/services/game-generation.service";

export function createGameGenerationRouter(gameService: GameGenerationService): Router {
  const router = Router();

  // Start generation
  router.post("/:projectId/generate", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { blueprintId, userId } = req.body;
      const result = await gameService.startGeneration(blueprintId || projectId, userId || "default-user");
      res.json({ success: true, executionId: result.id, status: "generation_started" });
    } catch (error) {
      res.status(500).json({ success: false, error: "Generation failed" });
    }
  });

  // Create blueprint
  router.post("/:projectId/blueprints", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { userId, ...input } = req.body;
      const blueprint = await gameService.createBlueprint(userId || "default-user", projectId, input);
      res.json({ success: true, data: blueprint });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to create blueprint" });
    }
  });

  // Get blueprint
  router.get("/blueprints/:blueprintId", async (req, res) => {
    try {
      const blueprint = await gameService.getBlueprint(req.params.blueprintId);
      if (!blueprint) {
        res.status(404).json({ success: false, error: "Blueprint not found" });
        return;
      }
      res.json({ success: true, data: blueprint });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch blueprint" });
    }
  });

  // Validate blueprint
  router.get("/blueprints/:blueprintId/validate", async (req, res) => {
    try {
      const blueprint = await gameService.getBlueprint(req.params.blueprintId);
      if (!blueprint) {
        res.status(404).json({ success: false, error: "Blueprint not found" });
        return;
      }
      const validation = gameService.validateBlueprint(blueprint);
      res.json({ success: true, ...validation });
    } catch (error) {
      res.status(500).json({ success: false, error: "Validation failed" });
    }
  });

  // Get generation status
  router.get("/:projectId/generation/:executionId/status", async (req, res) => {
    try {
      const execution = await gameService.getExecution(req.params.executionId);
      if (!execution) {
        res.status(404).json({ success: false, error: "Execution not found" });
        return;
      }
      res.json({ success: true, data: execution });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch status" });
    }
  });

  // List executions for blueprint
  router.get("/blueprints/:blueprintId/executions", async (req, res) => {
    try {
      const executions = await gameService.getExecutions(req.params.blueprintId);
      res.json({ success: true, data: executions });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to list executions" });
    }
  });

  // Cache stats
  router.get("/system/cache-stats", async (_req, res) => {
    try {
      const stats = gameService.getCacheStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to get cache stats" });
    }
  });

  return router;
}
