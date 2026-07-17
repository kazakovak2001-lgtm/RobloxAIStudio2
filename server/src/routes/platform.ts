/**
 * Platform API — User management, versioning, and agent registry.
 */

import { Router } from "express";
import { UserRepository } from "../platform/users";
import { AuthService } from "../platform/auth";
import { authService } from "../platform/auth/authServiceInstance";
import { VersionHistoryRepository } from "../platform/versioning";
import { AgentRegistryService } from "../platform/registry";
import {
  setAuthCookies,
  clearAuthCookies,
  getTokenFromCookies,
  getRefreshTokenFromCookies,
} from "../common/middleware/cookies";

export function createPlatformRouter(): Router {
  const router = Router();
  const users = new UserRepository();
  const auth = authService;
  const versions = new VersionHistoryRepository();
  const registry = new AgentRegistryService();

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
        token: loginResult.token,
        refreshToken: loginResult.refreshToken,
      },
    });
  });

  router.post("/auth/login", (req, res) => {
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
        token: result.token,
        refreshToken: result.refreshToken,
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
      req.body.refreshToken ?? getRefreshTokenFromCookies(req);
    if (!refreshToken) {
      res.status(400).json({ success: false, error: "refreshToken required" });
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
      data: { token: result.token, refreshToken: result.refreshToken },
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

  router.post("/users", (req, res) => {
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
    const user = users.create({ email, displayName, tier });
    res.json({ success: true, data: user });
  });

  router.get("/users/:id", (req, res) => {
    const user = users.getById(req.params.id);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: user });
  });

  router.get("/users/:id/limits", (req, res) => {
    const check = users.checkLimits(req.params.id);
    res.json({ success: true, data: check });
  });

  // ─── Versions ─────────────────────────────────────────────

  router.get("/versions/:projectId", (req, res) => {
    const history = versions.getHistory(req.params.projectId);
    res.json({ success: true, data: history });
  });

  router.post("/versions/:projectId", (req, res) => {
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
