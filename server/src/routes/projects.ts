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
import { StorageBlueprintRepository } from "../projects/repository/storageBlueprint.repository";
import type { IBlueprintRepository } from "../projects/repository/blueprint.repository";
import { getTokenFromCookies } from "../common/middleware/cookies";
import { getRequestApiKeyPrincipal } from "../common/middleware/security";
import {
  createResourceAuthorizer,
  type ProjectAccessCheck,
} from "./resourceAuthorization";
import { ProjectDeletionCoordinator } from "../platform/projects/ProjectDeletionCoordinator";
import { generationClaimProjectDeletion } from "../platform/projects/ProjectLifecycleCoordinator";

const PROJECT_ACCESS_CACHE_TTL_MS = 60_000;

type ProjectAccessCacheEntry = {
  allowed: boolean;
  expiresAt: number;
};

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
  clearAccessCache?(projectId?: string): void;
}

/**
 * A project access control that provides the concealing check.
 *
 * `hasProjectAccess` is optional on the interface because older callers only
 * ever needed `requireProjectAccess`. Anything built by `createProjectRuntime`
 * always provides it, and routes that conceal resource existence depend on it,
 * so the runtime states that rather than leaving each route to hope.
 */
export type ConcealingProjectAccess = ProjectAccessControl & {
  hasProjectAccess: ProjectAccessCheck;
};

export interface ProjectRuntime {
  projectRepository: SaaSProjectRepository;
  generationHistory: GenerationHistoryRepository;
  blueprintRepository: IBlueprintRepository;
  /**
   * PROJECT-ERASURE-1 / PROJECT-ERASURE-2. Deletes a project and every
   * directly project-owned durable record (blueprint, blueprint versions,
   * generation executions, blueprint change proposals, generation history,
   * generation active claim, generation start requests) as one atomic
   * transaction. Routes must go through this rather than deleting the
   * project record on its own.
   */
  deletion: ProjectDeletionCoordinator;
  access: ConcealingProjectAccess;
  /**
   * The provider both repositories above are built on. Exposed so a caller that
   * must commit several collections in one transaction can reach
   * `applyDurableBatch` instead of issuing independent writes.
   */
  storage: StorageProvider;
}

type RequestWithSession = Request & { user?: { userId?: string } };

export function createProjectRuntime(
  storage: StorageProvider,
  auth: AuthService = authService,
): ProjectRuntime {
  const projectRepository = new SaaSProjectRepository(storage);
  const generationHistory = new StorageGenerationHistoryRepository(storage);
  const blueprintRepository = new StorageBlueprintRepository(storage);
  const deletion = new ProjectDeletionCoordinator(storage, [
    blueprintRepository,
    generationHistory,
    generationClaimProjectDeletion(storage),
  ]);
  const accessCache = new Map<string, Map<string, ProjectAccessCacheEntry>>();

  const getAccessCacheKey = (projectId: string, userId: string): string =>
    `${projectId}:${userId}`;

  const getCachedProjectAccess = (
    projectId: string,
    userId: string,
  ): boolean | undefined => {
    const projectEntries = accessCache.get(projectId);
    if (!projectEntries) return undefined;

    const entry = projectEntries.get(userId);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      projectEntries.delete(userId);
      if (projectEntries.size === 0) {
        accessCache.delete(projectId);
      }
      return undefined;
    }

    return entry.allowed;
  };

  const setCachedProjectAccess = (
    projectId: string,
    userId: string,
    allowed: boolean,
  ): void => {
    const projectEntries = accessCache.get(projectId) ?? new Map();
    projectEntries.set(userId, {
      allowed,
      expiresAt: Date.now() + PROJECT_ACCESS_CACHE_TTL_MS,
    });
    accessCache.set(projectId, projectEntries);
  };

  const clearAccessCache = (projectId?: string): void => {
    if (projectId) {
      accessCache.delete(projectId);
      return;
    }
    accessCache.clear();
  };

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
    const principal = getRequestApiKeyPrincipal(req);
    if (principal) {
      if (
        !apiKeyCapability ||
        !principal.capabilities.includes(apiKeyCapability)
      ) {
        res.status(403).json({
          success: false,
          error: "API key is not permitted for this route",
        });
        return false;
      }
    } else {
      const userId = await requireAuthenticatedUser(req, res);
      if (!userId) return false;
      const cached = getCachedProjectAccess(projectId, userId);
      if (cached !== undefined) {
        return cached;
      }
    }

    const project = await requireOwned(req, res, {
      resource: "Project",
      id: projectId,
      load: (id: string) => projectRepository.get(id),
      projectOf: (loaded) => loaded.id,
      capability: apiKeyCapability,
    });

    if (principal) {
      return project !== null;
    }

    const userId = (req as RequestWithSession).user?.userId ??
      (await getRequestUserId(req));
    if (userId) {
      setCachedProjectAccess(projectId, userId, project !== null);
    }

    return project !== null;
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
    if (!userId) return false;

    const cached = getCachedProjectAccess(projectId, userId);
    if (cached !== undefined) {
      return cached;
    }

    const allowed = Boolean(
      projectRepository.get(projectId) &&
      projectRepository.verifyOwnership(projectId, userId),
    );
    setCachedProjectAccess(projectId, userId, allowed);
    return allowed;
  };

  const requireOwned = createResourceAuthorizer(hasProjectAccess);

  return {
    projectRepository,
    generationHistory,
    blueprintRepository,
    deletion,
    storage,
    access: {
      getRequestUserId,
      requireAuthenticatedUser,
      requireProjectAccess,
      hasProjectAccess,
      clearAccessCache,
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
  const {
    projectRepository: projects,
    generationHistory,
    deletion,
    access,
  } = runtime;

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
      access.clearAccessCache?.(project.id);
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
      access.clearAccessCache?.(req.params.id);
      res.json({ success: true, data: toProjectResponse(updated) });
    } catch (error) {
      handleProjectInputError(error, res);
    }
  });

  router.delete("/:id", async (req, res) => {
    if (!(await access.requireProjectAccess(req, res, req.params.id))) return;

    try {
      const deleted = await deletion.deleteProject(req.params.id);
      access.clearAccessCache?.(req.params.id);
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
