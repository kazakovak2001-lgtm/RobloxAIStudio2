/**
 * Agent Collaboration API — Multi-agent orchestration endpoints.
 */

import { Router } from "express";
import { AgentCoordinator } from "../agents/collaboration";

export function createAgentCollaborationRouter(): Router {
  const router = Router();
  const coordinator = new AgentCoordinator();

  // GET /api/agents/status — active agents and tasks
  router.get("/status", (_req, res) => {
    res.json({
      success: true,
      data: {
        activeAgents: coordinator.getActiveAgents(),
        tasks: coordinator.getTasks(),
        messageCount: coordinator.getMessageBus().count,
      },
    });
  });

  // GET /api/agents/messages — inter-agent messages
  router.get("/messages", (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    const messages = coordinator.getMessageBus().getMessages(agentId);
    res.json({ success: true, data: messages.slice(-50) });
  });

  // GET /api/agents/metrics — agent performance metrics
  router.get("/metrics", (_req, res) => {
    res.json({ success: true, data: coordinator.getMetrics() });
  });

  // POST /api/agents/run — start a collaborative session
  router.post("/run", (req, res) => {
    const { projectId, systems } = req.body;

    if (!projectId || !systems) {
      res
        .status(400)
        .json({ success: false, error: "projectId and systems required" });
      return;
    }

    const context = {
      agentId: "coordinator",
      role: "reviewer" as const,
      projectId,
      blueprint: {},
      knowledge: {},
      repairHistory: [],
      playtestReport: null,
      experienceManifest: null,
    };

    const tasks = coordinator.runCollaborativeSession(context, systems);
    res.json({
      success: true,
      data: { tasks, activeAgents: coordinator.getActiveAgents() },
    });
  });

  // GET /api/agents/consensus — consensus decisions
  router.get("/consensus", (_req, res) => {
    res.json({
      success: true,
      data: coordinator.getConsensus().getDecisions(),
    });
  });

  return router;
}
