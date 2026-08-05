import { Router, type Request, type Response } from "express";
import {
  SaaSProjectRepository,
  type SaaSProject,
  type SaaSProjectUpdate,
} from "../platform/projects";
import {
  DurableStorageError,
  type StorageProvider,
} from "../platform/storage/StorageProvider";
import type { AuthService } from "../platform/auth/AuthService";
import { authService } from "../platform/auth/authServiceInstance";
import {
  StorageGenerationHistoryRepository,
  type GenerationHistoryRepository,
} from "../projects/repository/generationHistory.repository";
import { getTokenFromCookies } from "../common/middleware/cookies";
import {
  getRequestApiKeyPrincipal,
  requireApiKeyCapability,
} from "../common/middleware/security";

export interface ProjectAccessControl {
  getRequestUserId(req: Request): Promise<string | null>;
  requireAuthenticatedUser(req: Request, res: Response): Promise<string | null>;
  requireProjectAccess(
    req: Request,
    res: Response,
    projectId: string,
    apiKeyCapability?: string,
  ): Promise<boolean>;
  hasProjectAccess?(
    req: Request,
    projectId: string,
    apiKeyCapability?: string,
  ): Promise<boolean>;
}

export interface ProjectRuntime {
  projectRepository: SaaSProjectRepository;
  generationHistory: GenerationHistoryRepository;
  access: ProjectAccessControl;
}

type RequestWithSession = Request & { user?: { userId?: string } };

export function createProjectRuntime(
  storage: StorageProvider,
  auth: AuthService = authService,
): ProjectRuntime {
  const projectRepository = new SaaSProjectRepository(storage);
  const generationHistory = new StorageGenerationHistoryRepository(storage);

  const getRequestUserId = async (req: Request): Promise<string | null> => {
    const attachedUserId = (req as RequestWithSession).user?.userId;
    if (attachedUserId) return attachedUserId;

    const token =
      req.headers.authorization?.replace("Bearer ", "") ??
      getTokenFromCookies(req);
    if (!token) return null;
    return (await auth.validateToken(token))?.userId ?? null;
  };

  const requireAuthenticatedUser = async (
    req: Request,
    res: Response,
  ): Promise<string | null> => {
    const userId = await getRequestUserId(req);
    if (userId) return userId;
    res.status(401).json({ success: false, error: "Authentication required" });
    return null;
  };

  const requireProjectAccess = async (
    req: Request,
    res: Response,
    projectId: string,
    apiKeyCapability?: string,
  ): Promise<boolean> => {
    if (getRequestApiKeyPrincipal(req)) {
      if (!apiKeyCapability) {
        res.status(403).json({
          success: false,
          error: "API key is not permitted for this route",
        });
        return false;
      }
      if (!requireApiKeyCapability(req, res, apiKeyCapability, projectId)) {
        return false;
      }
      if (!projectRepository.get(projectId)) {
        res.status(404).json({ success: false, error: "Project not found" });
        return false;
      }
      return true;
    }

    const userId = await requireAuthenticatedUser(req, res);
    if (!userId) return false;

    const project = projectRepository.get(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return false;
    }
    if (!projectRepository.verifyOwnership(projectId, userId)) {
      res.status(403).json({ success: false, error: "Access denied" });
      return false;
    }
    return true;
  };

  const hasProjectAccess = async (
    req: Request,
    projectId: string,
    apiKeyCapability?: string,
  ): Promise<boolean> => {
    const apiKeyPrincipal = getRequestApiKeyPrincipal(req);
    if (apiKeyPrincipal) {
      return Boolean(
        apiKeyCapability &&
        projectRepository.get(projectId) &&
        apiKeyPrincipal.capabilities.includes(apiKeyCapability) &&
        apiKeyPrincipal.resourceScopes.includes(projectId),
      );
    }
    const userId = await getRequestUserId(req);
    return Boolean(
      userId &&
      projectRepository.get(projectId) &&
      projectRepository.verifyOwnership(projectId, userId),
    );
  };

  return {
    projectRepository,
    generationHistory,
    access: {
      getRequestUserId,
      requireAuthenticatedUser,
      requireProjectAccess,
      hasProjectAccess,
    },
  };
}

/**
 * Projects API consumed by the standalone Frontend repository.
 * The response shape intentionally keeps its existing `type`/`progress` aliases
 * while the internal model remains `gameType`/`qualityScore`.
 */
export function createProjectsRouter(runtime: ProjectRuntime): Router {
  const router = Router();
  const { projectRepository: projects, generationHistory, access } = runtime;

  router.get("/", async (req, res) => {
    const userId = await access.requireAuthenticatedUser(req, res);
    if (!userId) return;
    res.json({
      success: true,
      data: projects.getByOwner(userId).map(toProjectResponse),
    });
  });

  router.get("/:id", async (req, res) => {
    if (!(await access.requireProjectAccess(req, res, req.params.id))) return;
    const project = projects.get(req.params.id);
    res.json({
      success: true,
      data: project ? toProjectResponse(project) : null,
    });
  });

  router.get("/:id/history", async (req, res) => {
    if (!(await access.requireProjectAccess(req, res, req.params.id))) return;
    res.json({
      success: true,
      data: generationHistory.getByProject(req.params.id),
    });
  });

  router.post("/", async (req, res) => {
    const userId = await access.requireAuthenticatedUser(req, res);
    if (!userId) return;

    try {
      const input = readCreateInput(req.body);
      const project = await projects.createDurable(
        userId,
        input.name,
        input.genre,
        input.description,
        input.patch,
      );
      res.json({ success: true, data: toProjectResponse(project) });
    } catch (error) {
      handleProjectInputError(error, res);
    }
  });

  router.put("/:id", async (req, res) => {
    if (!(await access.requireProjectAccess(req, res, req.params.id))) return;

    try {
      const patch = readProjectPatch(req.body);
      if (Object.keys(patch).length === 0) {
        throw new ProjectInputError(
          "At least one editable project field is required",
        );
      }
      const updated = await projects.updateDurable(req.params.id, patch);
      if (!updated) {
        res.status(404).json({ success: false, error: "Project not found" });
        return;
      }
      res.json({ success: true, data: toProjectResponse(updated) });
    } catch (error) {
      handleProjectInputError(error, res);
    }
  });

  router.delete("/:id", async (req, res) => {
    if (!(await access.requireProjectAccess(req, res, req.params.id))) return;

    try {
      const deleted = await projects.deleteDurable(req.params.id);
      res.json({ success: true, data: { deleted } });
    } catch (error) {
      handleProjectInputError(error, res);
    }
  });

  return router;
}

function readCreateInput(body: unknown): {
  name: string;
  genre: string;
  description: string;
  patch: SaaSProjectUpdate;
} {
  const input = asRecord(body);
  const name = requiredText(input, "name", 120);
  const genre =
    optionalText(input, "genre", 80) ??
    optionalText(input, "type", 80) ??
    "adventure";
  const description = optionalText(input, "description", 10000, true) ?? "";
  return { name, genre, description, patch: readProjectPatch(input) };
}

function readProjectPatch(body: unknown): SaaSProjectUpdate {
  const input = asRecord(body);
  const forbidden = [
    "id",
    "ownerId",
    "status",
    "qualityScore",
    "generationCount",
    "scriptCount",
    "assetCount",
    "createdAt",
    "updatedAt",
  ].find((field) => field in input);
  if (forbidden) {
    throw new ProjectInputError(`${forbidden} is managed by the server`);
  }

  const patch: SaaSProjectUpdate = {};
  const name = optionalText(input, "name", 120);
  const description = optionalText(input, "description", 10000, true);
  const genre = optionalText(input, "genre", 80);
  const gameType =
    optionalText(input, "gameType", 80) ?? optionalText(input, "type", 80);
  const difficulty = optionalText(input, "difficulty", 40);
  const players = optionalText(input, "players", 40);
  const targetAudience = optionalText(input, "targetAudience", 80);
  const coverUrl = optionalText(input, "coverUrl", 2048, true);

  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (genre !== undefined) patch.genre = genre;
  if (gameType !== undefined) patch.gameType = gameType;
  if (difficulty !== undefined) patch.difficulty = difficulty;
  if (players !== undefined) patch.players = players;
  if (targetAudience !== undefined) patch.targetAudience = targetAudience;
  if (coverUrl !== undefined) patch.coverUrl = coverUrl || undefined;
  return patch;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectInputError("Project input must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredText(
  input: Record<string, unknown>,
  field: string,
  max: number,
): string {
  const value = optionalText(input, field, max);
  if (!value) throw new ProjectInputError(`${field} is required`);
  return value;
}

function optionalText(
  input: Record<string, unknown>,
  field: string,
  max: number,
  allowEmpty = false,
): string | undefined {
  if (!(field in input)) return undefined;
  const value = input[field];
  if (typeof value !== "string") {
    throw new ProjectInputError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) {
    throw new ProjectInputError(`${field} cannot be empty`);
  }
  if (trimmed.length > max) {
    throw new ProjectInputError(`${field} must not exceed ${max} characters`);
  }
  return trimmed;
}

function toProjectResponse(project: SaaSProject) {
  return {
    id: project.id,
    name: project.name,
    type: project.gameType ?? project.genre,
    gameType: project.gameType ?? project.genre,
    genre: project.genre,
    description: project.description,
    difficulty: project.difficulty,
    players: project.players,
    targetAudience: project.targetAudience,
    coverUrl: project.coverUrl,
    status: project.status,
    progress: project.qualityScore,
    qualityScore: project.qualityScore,
    createdAt: new Date(project.createdAt).toISOString(),
    updatedAt: new Date(project.updatedAt).toISOString(),
  };
}

class ProjectInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectInputError";
  }
}

function handleProjectInputError(error: unknown, res: Response): void {
  if (error instanceof ProjectInputError) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof DurableStorageError) {
    console.error("[projects] durable mutation rejected", error);
    res.status(503).json({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    return;
  }
  console.error("[projects]", error);
  res.status(500).json({ success: false, error: "Project request failed" });
}
