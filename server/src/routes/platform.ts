/**
 * Platform API — User management, versioning, and agent registry.
 */

import { Router } from "express";
import { UserRepository } from "../platform/users";
import { VersionHistoryRepository } from "../platform/versioning";
import { AgentRegistryService } from "../platform/registry";

export function createPlatformRouter(): Router {
  const router = Router();
  const users = new UserRepository();
  const versions = new VersionHistoryRepository();
  const registry = new AgentRegistryService();

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
