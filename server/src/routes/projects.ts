import { Router } from "express";
import { SaaSProjectRepository } from "../platform/projects";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { AuthService } from "../platform/auth";
import { InMemoryGenerationHistoryRepository } from "../projects/repository/generationHistory.repository";

export const generationHistory = new InMemoryGenerationHistoryRepository();

export function createProjectsRouter() {
  const router = Router();
  const storage = new InMemoryStorageProvider();
  const projects = new SaaSProjectRepository(storage);
  const auth = new AuthService();

  // Helper: extract userId from token
  function getUserId(req: any): string | null {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return null;
    const session = auth.validateToken(token);
    return session?.userId ?? null;
  }

  // GET / — list authenticated user's projects
  router.get("/", (req, res) => {
    const userId = getUserId(req);
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
    const project = projects.get(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }
    const userId = getUserId(req);
    if (userId && !projects.verifyOwnership(req.params.id, userId)) {
      res.status(403).json({ success: false, error: "Access denied" });
      return;
    }
    res.json({ success: true, data: project });
  });

  // GET /:id/history — generation history (no auth required for now)
  router.get("/:id/history", (req, res) => {
    const records = generationHistory.getByProject(req.params.id);
    res.json({ success: true, data: records });
  });

  // POST / — create project with ownership
  router.post("/", (req, res) => {
    const { name, type, genre, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: "name is required" });
      return;
    }
    const userId = getUserId(req) ?? "anonymous";
    const project = projects.create(
      userId,
      name,
      genre ?? type ?? "adventure",
      description ?? "",
    );
    // Map to frontend-expected format
    res.json({
      success: true,
      data: {
        id: project.id,
        name: project.name,
        type: project.genre,
        genre: project.genre,
        description: project.description,
        status: project.status,
        progress: project.qualityScore,
        createdAt: new Date(project.createdAt).toISOString(),
        updatedAt: new Date(project.updatedAt).toISOString(),
      },
    });
  });

  // PUT /:id — update project (ownership checked)
  router.put("/:id", (req, res) => {
    const userId = getUserId(req);
    if (userId && !projects.verifyOwnership(req.params.id, userId)) {
      res.status(403).json({ success: false, error: "Access denied" });
      return;
    }
    const updated = projects.update(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }
    res.json({ success: true, data: updated });
  });

  // DELETE /:id — delete project (ownership checked)
  router.delete("/:id", (req, res) => {
    const userId = getUserId(req);
    if (userId && !projects.verifyOwnership(req.params.id, userId)) {
      res.status(403).json({ success: false, error: "Access denied" });
      return;
    }
    const deleted = projects.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }
    res.json({ success: true });
  });

  return router;
}
