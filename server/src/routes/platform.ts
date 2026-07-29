/**
 * Platform API — User management, versioning, and agent registry.
 */

import { Router, type Request, type Response } from "express";
import { UserRepository } from "../platform/users";
import { authService } from "../platform/auth/authServiceInstance";
import {
  DurableStorageError,
  type StorageProvider,
} from "../platform/storage/StorageProvider";
import { VersionHistoryRepository } from "../platform/versioning";
import { AgentRegistryService } from "../platform/registry";
import {
  setAuthCookies,
  clearAuthCookies,
  getTokenFromCookies,
  getRefreshTokenFromCookies,
} from "../common/middleware/cookies";
import type { ProjectAccessControl } from "./projects";
import { loginRateLimiter } from "../common/middleware/security";

interface UserPreferences {
  appearance: "dark" | "system";
  notifications: {
    product: boolean;
    generation: boolean;
    marketing: boolean;
  };
}

export interface PlatformRouterDependencies {
  storage: StorageProvider;
  access: ProjectAccessControl;
}

export function createPlatformRouter({
  storage,
  access,
}: PlatformRouterDependencies): Router {
  const router = Router();
  const users = new UserRepository(storage);
  const auth = authService;
  const versions = new VersionHistoryRepository();
  const registry = new AgentRegistryService();
  const preferences = new Map<string, UserPreferences>();
  const requireSelf = (req: Request, res: Response, userId: string) => {
    const requestUserId = access.requireAuthenticatedUser(req, res);
    if (!requestUserId) return false;
    if (requestUserId && requestUserId !== userId) {
      res.status(403).json({ success: false, error: "Access denied" });
      return false;
    }
    return true;
  };

  // ─── Auth ─────────────────────────────────────────────────

  router.post("/auth/register", (req, res) => {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      res.status(400).json({
        success: false,
        error: "email, password, and displayName required",
      });
      return;
    }
    const existing = users.getByEmail(email);
    if (existing) {
      res
        .status(409)
        .json({ success: false, error: "Email already registered" });
      return;
    }
    const user = users.create({ email, displayName });
    const registered = auth.register(email, password, user.id);
    if (!registered) {
      res
        .status(409)
        .json({ success: false, error: "Email already registered" });
      return;
    }
    const loginResult = auth.login(email, password, user.id);
    setAuthCookies(res, loginResult.token!, loginResult.refreshToken!);
    res.json({
      success: true,
      data: {
        user,
      },
    });
  });

  router.post("/auth/login", loginRateLimiter, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res
        .status(400)
        .json({ success: false, error: "email and password required" });
      return;
    }
    const user = users.getByEmail(email);
    if (!user) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }
    const result = auth.login(email, password, user.id);
    if (!result.success) {
      res.status(401).json({ success: false, error: result.error });
      return;
    }
    setAuthCookies(res, result.token!, result.refreshToken!);
    res.json({
      success: true,
      data: {
        user,
        role: result.role,
      },
    });
  });

  router.post("/auth/logout", (req, res) => {
    const token =
      req.headers.authorization?.replace("Bearer ", "") ??
      getTokenFromCookies(req);
    if (token) auth.logout(token);
    clearAuthCookies(res);
    res.json({ success: true });
  });

  router.post("/auth/refresh", (req, res) => {
    const refreshToken =
      getRefreshTokenFromCookies(req) ??
      (typeof req.body?.refreshToken === "string"
        ? req.body.refreshToken
        : null);
    if (!refreshToken) {
      res
        .status(400)
        .json({ success: false, error: "Refresh credential required" });
      return;
    }
    const result = auth.refreshSession(refreshToken);
    if (!result.success) {
      res.status(401).json({ success: false, error: result.error });
      return;
    }
    setAuthCookies(res, result.token!, result.refreshToken!);
    res.json({
      success: true,
      data: { refreshed: true },
    });
  });

  router.post("/auth/forgot-password", (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ success: false, error: "email required" });
      return;
    }
    // Do not reveal whether an account exists. A mail provider can consume this
    // accepted request when configured without changing the public contract.
    res.status(202).json({
      success: true,
      data: {
        accepted: true,
        deliveryConfigured: Boolean(process.env.EMAIL_PROVIDER),
      },
    });
  });

  router.get("/auth/me", (req, res) => {
    const token =
      req.headers.authorization?.replace("Bearer ", "") ??
      getTokenFromCookies(req);
    if (!token) {
      res.status(401).json({ success: false, error: "No token provided" });
      return;
    }
    const session = auth.validateToken(token);
    if (!session) {
      res
        .status(401)
        .json({ success: false, error: "Invalid or expired token" });
      return;
    }
    const user = users.getById(session.userId);
    res.json({ success: true, data: { user, role: session.role } });
  });

  // ─── Users ────────────────────────────────────────────────

  router.post("/users", async (req, res) => {
    const { email, displayName, tier } = req.body;
    if (!email || !displayName) {
      res
        .status(400)
        .json({ success: false, error: "email and displayName required" });
      return;
    }
    const existing = users.getByEmail(email);
    if (existing) {
      res
        .status(409)
        .json({ success: false, error: "Email already registered" });
      return;
    }

    try {
      const user = await users.createDurable({ email, displayName, tier });
      res.json({ success: true, data: user });
    } catch (error) {
      handlePlatformMutationError(error, res);
    }
  });

  router.get("/users/:id", (req, res) => {
    if (!requireSelf(req, res, req.params.id)) return;
    const user = users.getById(req.params.id);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: user });
  });

  router.patch("/users/:id", async (req, res) => {
    if (!requireSelf(req, res, req.params.id)) return;
    const { email, displayName } = req.body;
    const existing = typeof email === "string" ? users.getByEmail(email) : null;
    if (existing && existing.id !== req.params.id) {
      res
        .status(409)
        .json({ success: false, error: "Email already registered" });
      return;
    }

    try {
      const updated = await users.updateProfileDurable(req.params.id, {
        email: typeof email === "string" ? email : undefined,
        displayName: typeof displayName === "string" ? displayName : undefined,
      });
      if (!updated) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      handlePlatformMutationError(error, res);
    }
  });

  router.get("/users/:id/preferences", (req, res) => {
    if (!requireSelf(req, res, req.params.id)) return;
    res.json({
      success: true,
      data:
        preferences.get(req.params.id) ??
        ({
          appearance: "dark",
          notifications: {
            product: true,
            generation: true,
            marketing: false,
          },
        } satisfies UserPreferences),
    });
  });

  router.put("/users/:id/preferences", (req, res) => {
    if (!requireSelf(req, res, req.params.id)) return;
    const current =
      preferences.get(req.params.id) ??
      ({
        appearance: "dark",
        notifications: {
          product: true,
          generation: true,
          marketing: false,
        },
      } satisfies UserPreferences);
    const next: UserPreferences = {
      appearance:
        req.body.appearance === "system" || req.body.appearance === "dark"
          ? req.body.appearance
          : current.appearance,
      notifications: {
        ...current.notifications,
        ...(req.body.notifications ?? {}),
      },
    };
    preferences.set(req.params.id, next);
    res.json({ success: true, data: next });
  });

  router.get("/users/:id/limits", (req, res) => {
    if (!requireSelf(req, res, req.params.id)) return;
    const check = users.checkLimits(req.params.id);
    res.json({ success: true, data: check });
  });

  // ─── Versions ─────────────────────────────────────────────

  router.get("/versions/:projectId", (req, res) => {
    if (!access.requireProjectAccess(req, res, req.params.projectId)) return;
    const history = versions.getHistory(req.params.projectId);
    res.json({ success: true, data: history });
  });

  router.post("/versions/:projectId", (req, res) => {
    if (!access.requireProjectAccess(req, res, req.params.projectId)) return;
    const {
      label,
      pipelineId,
      scriptCount,
      assetCount,
      qualityScore,
      snapshot,
    } = req.body;
    const version = versions.save(req.params.projectId, {
      projectId: req.params.projectId,
      label: label ?? "auto",
      pipelineId,
      scriptCount: scriptCount ?? 0,
      assetCount: assetCount ?? 0,
      qualityScore: qualityScore ?? 0,
      snapshot: snapshot ?? {},
    });
    res.json({ success: true, data: version });
  });

  // ─── Agent Registry ───────────────────────────────────────

  router.get("/registry/agents", (_req, res) => {
    res.json({ success: true, data: registry.getActive() });
  });

  router.get("/registry/agents/:id", (req, res) => {
    const agent = registry.get(req.params.id);
    if (!agent) {
      res.status(404).json({ success: false, error: "Agent not found" });
      return;
    }
    res.json({ success: true, data: agent });
  });

  return router;
}

function handlePlatformMutationError(error: unknown, res: Response): void {
  if (error instanceof DurableStorageError) {
    res.status(503).json({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    return;
  }

  console.error("[platform]", error);
  res.status(500).json({ success: false, error: "Platform request failed" });
}
