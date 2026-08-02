/**
 * Agent Collaboration API — Multi-agent orchestration endpoints.
 */

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { AgentCoordinator } from "../agents/collaboration";
import type { ProjectAccessControl } from "./projects";

function requireCollaborationOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  const operatorIds = new Set(
    (process.env.COLLABORATION_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;
  if (!userId || !operatorIds.has(userId)) {
    res.status(403).json({
      success: false,
      error: "Collaboration operator access required",
    });
    return;
  }
  next();
}

export function createAgentCollaborationRouter(
  access: ProjectAccessControl,
): Router {
  const router = Router();
  const coordinator = new AgentCoordinator();

  // GET /api/agents/status — active agents and tasks
  router.get("/status", requireCollaborationOperator, (_req, res) => {
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
  router.get("/messages", requireCollaborationOperator, (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    const messages = coordinator.getMessageBus().getMessages(agentId);
    res.json({ success: true, data: messages.slice(-50) });
  });

  // GET /api/agents/metrics — agent performance metrics
  router.get("/metrics", requireCollaborationOperator, (_req, res) => {
    res.json({ success: true, data: coordinator.getMetrics() });
  });

  // POST /api/agents/run — start a collaborative session
  router.post("/run", async (req, res) => {
    const { projectId, systems } = req.body;

    if (!projectId || !systems) {
      res
        .status(400)
        .json({ success: false, error: "projectId and systems required" });
      return;
    }
    if (!(await access.requireProjectAccess(req, res, projectId))) return;

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
  router.get("/consensus", requireCollaborationOperator, (_req, res) => {
    res.json({
      success: true,
      data: coordinator.getConsensus().getDecisions(),
    });
  });

  return router;
}
