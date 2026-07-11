import { Router } from "express";
import { ProjectController } from "../projects/controllers/project.controller";
import { ProjectService } from "../projects/services/project.service";
import { InMemoryProjectRepository } from "../projects/repository/inMemoryProject.repository";
import { InMemoryGenerationHistoryRepository } from "../projects/repository/generationHistory.repository";

// Shared generation history (singleton for this process)
export const generationHistory = new InMemoryGenerationHistoryRepository();

export function createProjectsRouter() {
  const router = Router();
  const controller = new ProjectController(
    new ProjectService(new InMemoryProjectRepository()),
  );

  router.get("/", async (req, res, next) => {
    try {
      await controller.listProjects(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      await controller.getProject(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/projects/:id/history — generation history for a project
  router.get("/:id/history", (req, res) => {
    const records = generationHistory.getByProject(req.params.id);
    res.json({ success: true, data: records });
  });

  router.post("/", async (req, res, next) => {
    try {
      await controller.createProject(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id", async (req, res, next) => {
    try {
      await controller.updateProject(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      await controller.deleteProject(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
