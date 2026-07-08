/**
 * System status API — exposes AI platform state.
 */

import { Router } from "express";
import { getGovernanceAgentRegistry } from "../ai/agents";
import { createDefaultPromptEngine } from "../ai/prompts";

export function createSystemRouter(): Router {
  const router = Router();

  // GET /api/system/status
  router.get("/status", (_req, res) => {
    const registry = getGovernanceAgentRegistry();
    const promptEngine = createDefaultPromptEngine();
    res.json({
      success: true,
      data: {
        status: "operational",
        version: "1.6.0",
        agents: { total: registry.size, list: registry.listIds() },
        prompts: { total: promptEngine.size, metrics: promptEngine.metrics },
        uptime: process.uptime(),
        timestamp: Date.now(),
      },
    });
  });

  // GET /api/system/agents
  router.get("/agents", (_req, res) => {
    const registry = getGovernanceAgentRegistry();
    res.json({ success: true, data: registry.getAll() });
  });

  // GET /api/system/agents/:id
  router.get("/agents/:id", (req, res) => {
    const registry = getGovernanceAgentRegistry();
    const agent = registry.get(req.params.id);
    if (!agent) {
      res.status(404).json({ success: false, error: "Agent not found" });
      return;
    }
    res.json({ success: true, data: agent });
  });

  return router;
}
