/**
 * memory.routes.ts
 *
 * API exposure layer for the persistent memory system.
 */

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { MemoryEngine } from "../memory/core/MemoryEngine";
import type { ProjectAccessControl } from "./projects";

function requireMemoryOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  const operatorIds = new Set(
    (process.env.MEMORY_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;
  if (!userId || !operatorIds.has(userId)) {
    res.status(403).json({
      success: false,
      error: "Memory operator access required",
    });
    return;
  }
  next();
}

export function createMemoryRouter(access: ProjectAccessControl): Router {
  const router = Router();
  const engine = new MemoryEngine();

  // GET /memory/:agentId — get recent memory entries for an agent
  router.get("/:agentId", async (req, res) => {
    const { agentId } = req.params;
    const projectId = req.query.projectId as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "10", 10);
    if (!projectId) {
      res
        .status(400)
        .json({ success: false, error: "projectId query parameter required" });
      return;
    }
    if (!(await access.requireProjectAccess(req, res, projectId))) return;

    const entries = engine.getStore().getByAgent(agentId, projectId, limit);
    res.json({
      success: true,
      data: { agentId, entries, count: entries.length },
    });
  });

  // POST /memory/store — store a memory entry manually
  router.post("/store", async (req, res) => {
    try {
      const { agentId, projectId, input, output, tags } = req.body;
      if (!projectId) {
        res.status(400).json({ success: false, error: "projectId required" });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      await engine.storeMemory({
        agentId: agentId ?? "manual",
        projectId,
        input: input ?? {},
        output: output ?? {},
        timestamp: new Date(),
        tags,
      });
      res.json({ success: true, message: "Memory stored" });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to store memory" });
    }
  });

  // POST /memory/search — semantic search over memory
  router.post("/search", async (req, res) => {
    try {
      const { agentId, query, projectId, limit } = req.body;
      if (!projectId) {
        res.status(400).json({ success: false, error: "projectId required" });
        return;
      }
      if (!(await access.requireProjectAccess(req, res, projectId))) return;
      const result = await engine.retrieveMemory(
        agentId ?? "*",
        query ?? "",
        projectId,
        limit ?? 5,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: "Memory search failed" });
    }
  });

  // GET /memory/stats — get memory system stats
  router.get("/system/stats", requireMemoryOperator, (_req, res) => {
    const storeStats = engine.getStore().getStats();
    const semanticCount = engine.getSemantic().indexedCount;
    res.json({
      success: true,
      data: { store: storeStats, semanticIndexed: semanticCount },
    });
  });

  return router;
}
