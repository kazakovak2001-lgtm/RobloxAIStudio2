import { type Request, type Response, type NextFunction } from "express";
import { ProjectService } from "../services/project.service";
import { ProjectValidator } from "../validation/project.validation";

export class ProjectController {
  constructor(private projectService: ProjectService) {}

  async listProjects(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const projects = await this.projectService.list();
      res.json({ success: true, data: projects });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch projects" });
    }
  }

  async getProject(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const project = await this.projectService.getById(req.params.id);
      if (!project) {
        res.status(404).json({ success: false, error: "Project not found" });
        return;
      }
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch project" });
    }
  }

  async createProject(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const validator = new ProjectValidator();
      const validationErrors = validator.validateCreate(req.body);

      if (validationErrors.length > 0) {
        res.status(400).json({ success: false, errors: validationErrors });
        return;
      }

      const project = await this.projectService.create({
        ...req.body,
        userId: req.body.userId || "default",
      });
      res.status(201).json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to create project" });
    }
  }

  async updateProject(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const validator = new ProjectValidator();
      const validationErrors = validator.validateUpdate(req.body);

      if (validationErrors.length > 0) {
        res.status(400).json({ success: false, errors: validationErrors });
        return;
      }

      const project = await this.projectService.update(req.params.id, req.body);
      if (!project) {
        res.status(404).json({ success: false, error: "Project not found" });
        return;
      }
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to update project" });
    }
  }

  async deleteProject(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const deleted = await this.projectService.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ success: false, error: "Project not found" });
        return;
      }
      res.json({ success: true, message: "Project deleted" });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to delete project" });
    }
  }
}
