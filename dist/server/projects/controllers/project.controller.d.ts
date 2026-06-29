import { type Request, type Response, type NextFunction } from "express";
import { ProjectService } from "../services/project.service";
export declare class ProjectController {
    private projectService;
    constructor(projectService: ProjectService);
    listProjects(_req: Request, res: Response, _next: NextFunction): Promise<void>;
    getProject(req: Request, res: Response, _next: NextFunction): Promise<void>;
    createProject(req: Request, res: Response, _next: NextFunction): Promise<void>;
    updateProject(req: Request, res: Response, _next: NextFunction): Promise<void>;
    deleteProject(req: Request, res: Response, _next: NextFunction): Promise<void>;
}
