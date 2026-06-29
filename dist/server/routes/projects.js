import { Router } from "express";
import { ProjectController } from "../projects/controllers/project.controller";
import { ProjectService } from "../projects/services/project.service";
import { InMemoryProjectRepository } from "../projects/repository/inMemoryProject.repository";
export function createProjectsRouter() {
    const router = Router();
    const controller = new ProjectController(new ProjectService(new InMemoryProjectRepository()));
    router.get("/", async (req, res, next) => {
        try {
            await controller.listProjects(req, res, next);
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/:id", async (req, res, next) => {
        try {
            await controller.getProject(req, res, next);
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/", async (req, res, next) => {
        try {
            await controller.createProject(req, res, next);
        }
        catch (error) {
            next(error);
        }
    });
    router.put("/:id", async (req, res, next) => {
        try {
            await controller.updateProject(req, res, next);
        }
        catch (error) {
            next(error);
        }
    });
    router.delete("/:id", async (req, res, next) => {
        try {
            await controller.deleteProject(req, res, next);
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
