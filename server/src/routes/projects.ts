import { Router, type Request, type Response } from "express";
import { SaaSProjectRepository } from "../platform/projects";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { InMemoryGenerationHistoryRepository } from "../projects/repository/generationHistory.repository";
import { getTokenFromCookies } from "../common/middleware/cookies";
import { authService } from "../platform/auth/authServiceInstance";

export const generationHistory = new InMemoryGenerationHistoryRepository();
const projectStorage = new InMemoryStorageProvider();
export const projectRepository = new SaaSProjectRepository(projectStorage);

export function getRequestUserId(req: Request): string | null {
  const token =
    req.headers.authorization?.replace("Bearer ", "") ??
    getTokenFromCookies(req);
  if (!token) return null;
  const session = authService.validateToken(token);
  return session?.userId ?? null;
}

export function requireProjectAccess(
  req: Request,
  res: Response,
  projectId: string,
): boolean {
  if (!projectRepository.get(projectId)) {
    res.status(404).json({ success: false, error: "Project not found" });
    return false;
  }
  const userId = getRequestUserId(req);
  if (userId && !projectRepository.verifyOwnership(projectId, userId)) {
    res.status(403).json({ success: false, error: "Access denied" });
    return false;
  }
  return true;
}

export function createProjectsRouter() {
  const router = Router();
  const storage = projectStorage;
  const projects = projectRepository;

  // GET / — list authenticated user's projects
  router.get("/", (req, res) => {
    const userId = getRequestUserId(req);
    if (!userId) {
      // Fallback: return all for unauthenticated (backwards compat during transition)
      const all = storage.list("projects");
      res.json({ success: true, data: all });
      return;
    }
    const userProjects = projects.getByOwner(userId);
    res.json({ success: true, data: userProjects });
  });

  // GET /:id — get single project (ownership checked)
  router.get("/:id", (req, res) => {
    if (!requireProjectAccess(req, res, req.params.id)) return;
    const project = projects.get(req.params.id);
    res.json({ success: true, data: project });
  });

  // GET /:id/history — generation history
  router.get("/:id/history", (req, res) => {
    if (!requireProjectAccess(req, res, req.params.id)) return;
    const records = generationHistory.getByProject(req.params.id);
    res.json({ success: true, data: records });
  });

  // POST / — create project with ownership
  router.post("/", (req, res) => {
    const {
      name,
      type,
      genre,
      description,
      difficulty,
      players,
      targetAudience,
      coverUrl,
    } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: "name is required" });
      return;
    }
    const userId = getRequestUserId(req) ?? "anonymous";
    const created = projects.create(
      userId,
      name,
      genre ?? type ?? "adventure",
      description ?? "",
    );
    const project =
      projects.update(created.id, {
        ...(type ? { gameType: type } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(players ? { players } : {}),
        ...(targetAudience ? { targetAudience } : {}),
        ...(coverUrl ? { coverUrl } : {}),
      }) ?? created;
    // Map to frontend-expected format
    res.json({
      success: true,
      data: {
        id: project.id,
        name: project.name,
        type: project.gameType ?? project.genre,
        genre: project.genre,
        description: project.description,
        difficulty: project.difficulty,
        players: project.players,
        targetAudience: project.targetAudience,
        coverUrl: project.coverUrl,
        status: project.status,
        progress: project.qualityScore,
        createdAt: new Date(project.createdAt).toISOString(),
        updatedAt: new Date(project.updatedAt).toISOString(),
      },
    });
  });

  // PUT /:id — update project (ownership checked)
  router.put("/:id", (req, res) => {
    if (!requireProjectAccess(req, res, req.params.id)) return;
    const updated = projects.update(req.params.id, req.body);
    res.json({ success: true, data: updated });
  });

  // DELETE /:id — delete project (ownership checked)
  router.delete("/:id", (req, res) => {
    if (!requireProjectAccess(req, res, req.params.id)) return;
    const deleted = projects.delete(req.params.id);
    res.json({ success: true, data: { deleted } });
  });

  return router;
}
