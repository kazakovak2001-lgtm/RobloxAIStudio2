import { ProjectValidator } from "../validation/project.validation";
export class ProjectController {
    constructor(projectService) {
        this.projectService = projectService;
    }
    async listProjects(_req, res, _next) {
        try {
            const projects = await this.projectService.list();
            res.json({ success: true, data: projects });
        }
        catch (error) {
            res.status(500).json({ success: false, error: "Failed to fetch projects" });
        }
    }
    async getProject(req, res, _next) {
        try {
            const project = await this.projectService.getById(req.params.id);
            if (!project) {
                res.status(404).json({ success: false, error: "Project not found" });
                return;
            }
            res.json({ success: true, data: project });
        }
        catch (error) {
            res.status(500).json({ success: false, error: "Failed to fetch project" });
        }
    }
    async createProject(req, res, _next) {
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
        }
        catch (error) {
            res.status(500).json({ success: false, error: "Failed to create project" });
        }
    }
    async updateProject(req, res, _next) {
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
        }
        catch (error) {
            res.status(500).json({ success: false, error: "Failed to update project" });
        }
    }
    async deleteProject(req, res, _next) {
        try {
            const deleted = await this.projectService.delete(req.params.id);
            if (!deleted) {
                res.status(404).json({ success: false, error: "Project not found" });
                return;
            }
            res.json({ success: true, message: "Project deleted" });
        }
        catch (error) {
            res.status(500).json({ success: false, error: "Failed to delete project" });
        }
    }
}
